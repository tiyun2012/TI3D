
export const LayoutConfig = {
    GRID_SIZE: 20,
    NODE_WIDTH: 180,
    PREVIEW_NODE_WIDTH: 240, 
    CODE_NODE_WIDTH: 300, 
    REROUTE_SIZE: 12,
    HEADER_HEIGHT: 36, 
    ITEM_HEIGHT: 24,   
    PIN_RADIUS: 6,
    BORDER: 1,         
    GAP: 4,            
    PADDING_TOP: 8,    
    WIRE_GAP: 0,

    // Precise dimensions for Code/ForLoop Nodes
    // These act as the Single Source of Truth for both rendering and wire calculation
    CODE_BLOCK_HEIGHT: 128, // Matches h-32
    CODE_LABEL_HEIGHT: 14,  // Height for the "GLSL Code Body" label
    CODE_FOOTER_HEIGHT: 12, // Height for the variable list footer
    CODE_GAP: 4,            // Matches gap-1
    CODE_MARGIN_BOTTOM: 8,  // Matches mb-2
    
    // Texture Preview
    // 160px height matches the inner width of a 180px node (minus padding), creating a square UV viewport
    TEXTURE_PREVIEW_HEIGHT: 160
};
