/* Verifies if the Shopify App Embed is active on the merchant's live theme.
    Checks the 'main' theme specifically
 */
async function verifyAppEmbed(admin, extensionId){
    // Get the current published [main] theme
    const themeResponse = await admin.rest.resources.Theme.all({
        session: admin.session,
    });

    const mainTheme = themeResponse.data.find((t) => t.role === "main");

    if (!mainTheme){
        return { isEnabled: false, themeName: "Unknown"};
    }

    // Reach into Shopify server and grab the live theme
    // by fetching the settings_data.json file and checking
    const assetRespone = await admin.rest.resources.Asset.all({
        session: admin.session,
        theme_id: mainTheme.id,
        asset: {"key": "config/settings_data.json"},
    });
    
    const settings = JSON.parse(assetRespone.data[0].value);

    const blocks = settings.current.blocks || {};

    const embed = Object.values(blocks).find(
        (b) => b.type && b.type.includes(extensionId)
    );

    // returns true only if we have appEmbed enabled 
    // for this specific live theme
    return {
        isEnabled: !!(embed && embed.disabled === false),
        themeName: mainTheme.name
    }; // Returns an object for the UI to display
} 