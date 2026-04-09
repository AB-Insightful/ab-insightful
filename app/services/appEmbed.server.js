export async function verifyAppEmbed(admin, typePrefix, session) {
    try {
      // Get the Main Theme ID
      const themeQuery = await admin.graphql(`
          query {
            themes(first: 10, roles: [MAIN]) {
              nodes {
                id
                name
              }
            }
          }
        `);
  
      const themeResponse = await themeQuery.json();
      const mainTheme = themeResponse.data?.themes?.nodes[0];
  
      if (!mainTheme) {
        return { isEnabled: false, themeName: "Unknown" };
      }
  
      // Convert GID to numeric ID
      const themeId = mainTheme.id.split('/').pop();
  
      // Fetch via Raw REST Request
      // Use the session passed from the action to get shop and accessToken
      if (!session) throw new Error("No session provided to verification service");
  
      const shop = session.shop;
      const accessToken = session.accessToken;
  
      const restResponse = await fetch(
        `https://${shop}/admin/api/2025-01/themes/${themeId}/assets.json?asset[key]=config/settings_data.json`,
        {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );
  
      const assetData = await restResponse.json();
      const assetValue = assetData.asset?.value;
  
      if (!assetValue) {
        return { isEnabled: false, themeName: mainTheme.name };
      }
  
      // Parse and Find the Embed
      const settings = JSON.parse(assetValue);
      const blocks = settings.current?.blocks || {};

      // console.log("DEBUG: Available Theme Blocks:", JSON.stringify(blocks, null, 2));
  
      const embed = Object.values(blocks).find(
        (b) =>
          b &&
          typeof b === "object" &&
          typeof b.type === "string" &&
          b.type.includes(typePrefix)
      );
      
      // The console log that shows if the app embed is found & enabled
      // disabled: false -> means the app embed is enabled      
      // //console.log("DEBUG: Found Embed:", JSON.stringify(embed, null, 2));
      
      return {
        isEnabled: !!(embed && embed.disabled === false),
        themeName: mainTheme.name
      };
  
    } catch (error) {
      console.error("Manual Verification Error:", error);
      return {
        isEnabled: false,
        themeName: "Error",
        error: error.message
      };
    }
  }