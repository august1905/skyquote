interface NameStepProps {
	title: string;
	onChange: (title: string) => void;
}

/**
 * §11 step 1: "Name the document — resolve variable tokens in the template
 * name." Scoped down: this is a plain, freely-editable text field seeded
 * from the template's own name, not a live preview that re-substitutes
 * variable tokens as later steps fill them in — the actual resolution
 * happens once, at Create, against whatever this field says at that point
 * (see resolveVariables.ts's `resolveTitle`). Reactively re-deriving this
 * field from step 3's in-progress answers would fight the admin's own edits
 * here the moment they diverge.
 */
export function NameStep({ title, onChange }: NameStepProps) {
	return (
		<div className="wizard-step">
			<label className="wizard-field">
				Document title
				<input type="text" value={title} onChange={(e) => onChange(e.target.value)} placeholder="Untitled document" autoFocus />
			</label>
			<p className="wizard-hint">
				Starts from the template&apos;s own name. Any <code>[Variable]</code> tokens in it are resolved to their final values once
				you create the document.
			</p>
		</div>
	);
}
