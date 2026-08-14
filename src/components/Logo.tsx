import logoUrl from '../assets/Full-Logos-White11.png';

// The one and only brand mark — a real asset (Skyline Cleaning Services'
// own logo lockup), never re-typeset as text. White-colored, so every
// place this renders needs a dark (navy) backdrop behind it.
function Logo({ height = 28, className }: { height?: number; className?: string }) {
	return <img src={logoUrl} alt="Skyline Cleaning Services" height={height} className={className} />;
}

export default Logo;
