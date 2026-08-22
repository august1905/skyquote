/**
 * `Casey Client` → `CC`, `Client` → `CL`.
 *
 * §3's role avatar stack shows "initials only (`CL`, `SE`)", and a one-word role
 * still needs two characters to read as a chip rather than as a dot — hence the
 * two-letter fallback rather than just the first initial.
 */
export function roleInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '??';
	if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
	return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
}
