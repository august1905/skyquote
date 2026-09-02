/**
 * Line icons for app chrome — thin single-weight strokes on `currentColor`,
 * per the Skyline design system's iconography rules (its brand sets are
 * supplied PNGs for marketing surfaces; generic UI glyphs are line icons,
 * and **emoji are not used**). Hand-inlined rather than pulling in an icon
 * package for half a dozen glyphs.
 *
 * All take the enclosing button's color and a `size` in px (default 20).
 */

interface IconProps {
	size?: number;
}

function Svg({ size = 20, children }: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

export function PeopleIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="9" cy="8" r="3.2" />
			<path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
			<circle cx="16.8" cy="9.4" r="2.4" />
			<path d="M15.4 14.6c2.4.1 4.3 1.5 5 4" />
		</Svg>
	);
}

export function VariablesIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="4" y="4" width="12" height="12" rx="2" />
			<path d="M20 8v8a4 4 0 0 1-4 4H8" />
		</Svg>
	);
}

export function PricingIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M12 3v18" />
			<path d="M16.5 6.5c-.8-1.2-2.4-1.9-4.3-1.9-2.3 0-4.2 1.3-4.2 3.2 0 4.4 8.9 2.1 8.9 6.5 0 1.9-1.9 3.2-4.6 3.2-2.1 0-3.9-.8-4.8-2.1" />
		</Svg>
	);
}

export function LibraryIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="3.5" y="4" width="17" height="5" rx="1.2" />
			<path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" />
			<path d="M10 13h4" />
		</Svg>
	);
}

export function PaperclipIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M20 11.5 12.3 19a5 5 0 0 1-7-7l8-7.8a3.3 3.3 0 0 1 4.7 4.7l-7.8 7.6a1.7 1.7 0 0 1-2.4-2.4l7-6.9" />
		</Svg>
	);
}

export function PaletteIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2-.8 2-1.8 0-.9-.6-1.4-.6-2.2 0-1 .8-1.8 2-1.8h1.9a3.2 3.2 0 0 0 3.2-3.2C20.5 6.7 16.7 3.5 12 3.5Z" />
			<circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
			<circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
			<circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
		</Svg>
	);
}
