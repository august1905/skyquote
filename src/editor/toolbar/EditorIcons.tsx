/**
 * The handful of toolbar controls whose meaning is a *shape*, drawn rather than
 * borrowed from Unicode.
 *
 * The alignment buttons used to be `⯇ ≡ ⯈ ☰` — two arrows and two line-stacks
 * that render almost identically at 14px, so the row said nothing about what any
 * of the four did. Alignment is exactly the case where the icon *is* the
 * explanation: ragged-right lines mean left-aligned in a way no glyph substitute
 * manages.
 *
 * Inline SVG rather than an icon dependency: six icons is not worth a package,
 * and `currentColor` means they inherit the button's own hover/disabled/pressed
 * colours for free.
 */

interface IconProps {
	/** Every icon is decorative — the button around it carries the accessible name. */
	size?: number;
}

function Svg({ size = 15, children }: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			aria-hidden="true"
			focusable="false"
		>
			{children}
		</svg>
	);
}

/** Full-width and short lines all starting at the left edge — a ragged right margin. */
export function AlignLeftIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<line x1="2" y1="3.5" x2="14" y2="3.5" />
			<line x1="2" y1="6.8" x2="9" y2="6.8" />
			<line x1="2" y1="10.1" x2="14" y2="10.1" />
			<line x1="2" y1="13.4" x2="9" y2="13.4" />
		</Svg>
	);
}

/** Short lines centred, so both margins are ragged. */
export function AlignCenterIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<line x1="2" y1="3.5" x2="14" y2="3.5" />
			<line x1="4.5" y1="6.8" x2="11.5" y2="6.8" />
			<line x1="2" y1="10.1" x2="14" y2="10.1" />
			<line x1="4.5" y1="13.4" x2="11.5" y2="13.4" />
		</Svg>
	);
}

/** The mirror of left: short lines pushed to the right edge. */
export function AlignRightIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<line x1="2" y1="3.5" x2="14" y2="3.5" />
			<line x1="7" y1="6.8" x2="14" y2="6.8" />
			<line x1="2" y1="10.1" x2="14" y2="10.1" />
			<line x1="7" y1="13.4" x2="14" y2="13.4" />
		</Svg>
	);
}

/** Every line the same full width — the one icon with no ragged edge, which is the whole idea. */
export function AlignJustifyIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<line x1="2" y1="3.5" x2="14" y2="3.5" />
			<line x1="2" y1="6.8" x2="14" y2="6.8" />
			<line x1="2" y1="10.1" x2="14" y2="10.1" />
			<line x1="2" y1="13.4" x2="14" y2="13.4" />
		</Svg>
	);
}

/** An arrow curving back on itself to the left. */
export function UndoIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M3 8h7a3.5 3.5 0 0 1 0 7H6" strokeLinejoin="round" />
			<polyline points="6,4.5 2.5,8 6,11.5" strokeLinejoin="round" />
		</Svg>
	);
}

/** The same arrow mirrored — redo is undo's reflection, and looking like it is the point. */
export function RedoIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M13 8H6a3.5 3.5 0 0 0 0 7h4" strokeLinejoin="round" />
			<polyline points="10,4.5 13.5,8 10,11.5" strokeLinejoin="round" />
		</Svg>
	);
}
