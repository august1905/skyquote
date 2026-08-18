import { useEffect, useRef, useState } from 'react';
import { INSERTABLE_BLOCK_KINDS } from '../blocks/insertable';
import type { Block } from '../types';
import './canvas.css';

interface AddBlockMenuProps {
	onInsert: (block: Block) => void;
}

// §4.1's path 2 ("click a palette tile → insert after the selected block or
// at page end"), scoped down to "at page end" — there's no persistent
// Content panel/palette yet (that's the right-rail UI §3 describes, not
// built in phase 1 or 2's block-catalog slice), so this is a lightweight
// stand-in reachable from the page itself.
export function AddBlockMenu({ onInsert }: AddBlockMenuProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function handleOutsideClick(event: MouseEvent) {
			if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
		}
		document.addEventListener('mousedown', handleOutsideClick);
		return () => document.removeEventListener('mousedown', handleOutsideClick);
	}, [open]);

	return (
		<div className="canvas-add-block-menu" ref={containerRef}>
			<button type="button" className="canvas-add-block" onClick={() => setOpen((o) => !o)}>
				+ Add block
			</button>
			{open && (
				<div className="canvas-add-block-options" role="menu">
					{INSERTABLE_BLOCK_KINDS.map((kind) => (
						<button
							key={kind.type}
							type="button"
							role="menuitem"
							onClick={() => {
								onInsert(kind.create());
								setOpen(false);
							}}
						>
							{kind.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
