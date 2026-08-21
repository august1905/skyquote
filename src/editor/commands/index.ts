export type { Command } from './types';
export type { BlockContainer } from './blockCommands';
export { insertBlock, deleteBlock, duplicateBlock, moveBlock, setBlockDoc, setBlockStyle, toggleBlockLock } from './blockCommands';
export { addPage, deletePage, duplicatePage, movePage, renamePage, setPageBackground } from './pageCommands';
export { addColumn, addRow, removeColumn, removeRow, setCellDoc, toggleHeaderRow } from './tableCommands';
export { setImageAlt, setImageShape, setImageSize } from './imageCommands';
export { setVideoAutoplay } from './videoCommands';
export { defaultTheme, setTheme } from './themeCommands';
export { defaultPageSettings, setPageSettings } from './pageSettingsCommands';
export type { PageSettingsPatch } from './pageSettingsCommands';
export { setTocLevels } from './tocCommands';
export { renameSmartContent, setSmartContentRules, unwrapSmartContent, wrapInSmartContent } from './smartContentCommands';
export { addRole, createRole, defaultRoleColor, moveRole, nextRoleName, recolorRole, removeRole, renameRole, setIsSender, setSigningOrder } from './roleCommands';
export { addVariable, customVariableKey, removeVariable, updateVariable } from './variableCommands';
export type { VariableDefPatch } from './variableCommands';
export { createField, deleteFieldsForRole, nextFieldName, reassignFieldsRole, setFieldConfig } from './fieldCommands';
export type { FieldConfigPatch } from './fieldCommands';
export { createFieldBlock } from './blockTree';
export { containerBlocksOf } from './blockTree';
export { createBlankPage, createBlankTextBlock, createBlankPricingItem, createPricingItemFromCatalog, createColumnsBlock, createImageBlock, createPageBreakBlock, createPricingTableBlock, createQuoteBuilderBlock, createSmartContentBlock, createTableBlock, createTocBlock, createVideoBlock } from './blockTree';
export {
	addPricingItem,
	addPricingItemFromCatalog,
	addPricingSection,
	addQuoteGroup,
	addQuoteOption,
	removePricingItem,
	removePricingSection,
	removeQuoteGroup,
	removeQuoteOption,
	renamePricingSection,
	setPricingTableCurrency,
	setPricingTableSettings,
	setQuoteBuilderCurrency,
	updatePricingItem,
	updateQuoteGroup,
	updateQuoteOption,
} from './pricingCommands';
export type { PricingItemPatch, PricingTableSettingsPatch, QuoteGroupPatch } from './pricingCommands';
