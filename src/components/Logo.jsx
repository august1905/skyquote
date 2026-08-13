import logoUrl from '../assets/Full-Logos-White11.png';

// The one and only brand mark — a real asset (Skyline Cleaning Services'
// own logo lockup), never re-typeset as text. White-colored, so every
// place this renders needs a dark (navy) backdrop behind it.
// eslint-disable-next-line react/prop-types -- no PropTypes elsewhere in this codebase
function Logo({ height = 28, className }) {
	return <img src={logoUrl} alt="Skyline Cleaning Services" height={height} className={className} />;
}

export default Logo;
