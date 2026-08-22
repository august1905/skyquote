import type { UploadProgressEntry } from './useImageLibrary';

interface UploadProgressListProps {
	uploads: UploadProgressEntry[];
	onDismissFinished: () => void;
	onDismiss: (key: string) => void;
}

/**
 * Per-file upload state. Rendered as a live region so a screen reader hears each
 * file finish rather than only seeing a grid quietly grow.
 *
 * A failed row stays until it's dismissed. "Three of your four uploaded" is
 * exactly the case where silently clearing the list loses the one thing the user
 * needed to read.
 */
export function UploadProgressList({ uploads, onDismissFinished, onDismiss }: UploadProgressListProps) {
	if (uploads.length === 0) return null;

	const settled = uploads.filter((u) => u.state !== 'uploading').length;

	return (
		<div className="image-uploads" role="status" aria-live="polite">
			<div className="image-uploads-header">
				<span>
					{uploads.some((u) => u.state === 'uploading')
						? `Uploading ${uploads.filter((u) => u.state === 'uploading').length} of ${uploads.length}…`
						: `${uploads.filter((u) => u.state === 'done').length} uploaded`}
				</span>
				{settled === uploads.length && (
					<button type="button" onClick={onDismissFinished}>
						Clear
					</button>
				)}
			</div>
			<ul>
				{uploads.map((upload) => (
					<li key={upload.key} className={`image-upload-row image-upload-${upload.state}`}>
						<span className="image-upload-state" aria-hidden="true">
							{upload.state === 'uploading' ? '↑' : upload.state === 'done' ? '✓' : '!'}
						</span>
						<span className="image-upload-name">{upload.filename}</span>
						{upload.error && <span className="image-upload-error">{upload.error}</span>}
						{upload.state === 'failed' && (
							<button type="button" aria-label={`Dismiss ${upload.filename}`} onClick={() => onDismiss(upload.key)}>
								×
							</button>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
