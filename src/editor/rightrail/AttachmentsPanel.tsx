import { useRef, useState } from 'react';
import { addAttachment, removeAttachment, renameAttachment } from '../commands';
import { useEditorStore } from '../store/editorStore';
import { resolveAssetUrl, uploadFileAsset, assetFileRelativePath } from '../../api/assets';
import './rightrail.css';

interface AttachmentsPanelProps {
	onClose: () => void;
}

/** Rounded to whole units — an attachment list wants "1.4 MB", not a byte count. */
function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * §3's Attachments panel: "files appended to generated documents."
 *
 * Attachments are stored in `TemplateBody` and added/removed through ordinary
 * undoable commands, so they autosave and undo like any other edit — and they
 * reach documents for free, since a document's body is a snapshot of the
 * template's. Recipients see them as a download list at the end of their
 * document (`DocumentView.tsx`), fetched through the same token-gated public
 * asset route images already use.
 *
 * The upload itself isn't a command (a `Command` must be synchronous and pure),
 * so it happens here first and only the resulting reference becomes one — the
 * same split `useContentLibrary` makes.
 */
export function AttachmentsPanel({ onClose }: AttachmentsPanelProps) {
	const runCommand = useEditorStore((s) => s.runCommand);
	const endCoalescing = useEditorStore((s) => s.endCoalescing);
	const attachments = useEditorStore((s) => s.body?.attachments ?? []);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		setUploading(true);
		setError(null);
		try {
			// Sequential rather than parallel: each upload is a base64 body up to
			// ~8MB, and firing five at once is a good way to make the slowest one
			// look like a hang.
			for (const file of Array.from(files)) {
				const asset = await uploadFileAsset(file);
				runCommand(
					addAttachment({
						assetId: asset.id,
						name: asset.filename,
						filename: asset.filename,
						contentType: asset.contentType,
						sizeBytes: asset.sizeBytes,
					})
				);
			}
		} catch (uploadError) {
			// The backend's own message is the useful one here — it names the real
			// limit ("File exceeds the 6MB limit") or the accepted formats, which a
			// generic "upload failed" would throw away.
			setError(uploadError instanceof Error ? uploadError.message : 'Could not upload that file');
		} finally {
			setUploading(false);
			// Cleared so re-picking the same file fires `change` again.
			if (fileInputRef.current) fileInputRef.current.value = '';
		}
	}

	return (
		<div className="attachments-panel">
			<div className="theme-panel-header">
				<h2>Attachments</h2>
				<button type="button" aria-label="Close attachments panel" onClick={onClose}>
					×
				</button>
			</div>

			<p className="attachments-panel-hint">Files appended to every document created from this template.</p>

			<input
				ref={fileInputRef}
				type="file"
				multiple
				aria-label="Add attachment"
				disabled={uploading}
				onChange={(event) => void handleFiles(event.target.files)}
			/>
			{uploading && <p className="attachments-panel-hint">Uploading…</p>}
			{error && (
				<p className="attachments-panel-error" role="alert">
					{error}
				</p>
			)}

			{attachments.length === 0 && !uploading && <p className="attachments-panel-hint">No attachments yet.</p>}

			<ul className="attachments-list">
				{attachments.map((attachment) => (
					<li key={attachment.assetId} className="attachments-item">
						<input
							type="text"
							aria-label={`Name for ${attachment.filename}`}
							value={attachment.name}
							onChange={(event) =>
								runCommand(renameAttachment(attachment.assetId, event.target.value), {
									coalesceKey: `attachment-name-${attachment.assetId}`,
								})
							}
							onBlur={endCoalescing}
						/>
						<span className="attachments-item-meta">
							{attachment.filename} · {formatSize(attachment.sizeBytes)}
						</span>
						<div className="attachments-item-actions">
							{/* Opens in a new tab rather than downloading in place: this is
							    the author checking they attached the right file, and a
							    download that replaces the editor tab would lose their work
							    in progress. */}
							<a href={resolveAssetUrl(assetFileRelativePath(attachment.assetId))} target="_blank" rel="noreferrer">
								Preview
							</a>
							<button type="button" onClick={() => runCommand(removeAttachment(attachment.assetId))}>
								Remove
							</button>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
