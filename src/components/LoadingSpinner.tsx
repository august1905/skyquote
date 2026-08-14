import './LoadingSpinner.css';

// A centered spinner rather than a page of plain text — used both for a
// full page/panel taking over a content area (`fullPage`) and, without it,
// as a small inline indicator alongside already-loaded content.
function LoadingSpinner({ fullPage = false, label = 'Loading…' }: { fullPage?: boolean; label?: string }) {
	return (
		<div className={fullPage ? 'loading-spinner-page' : 'loading-spinner-inline'} role="status">
			<span className="loading-spinner" aria-hidden="true" />
			<span className="visually-hidden">{label}</span>
		</div>
	);
}

export default LoadingSpinner;
