import { register } from "@shopify/web-pixels-extension";
// [ryan] this seems like a really brittle and obtuse way of doing this.
// but the page_viewed event doesn't have an explicit field
// for the 'page associated resource' (blog, product, other?)
// i can't seem to find an enumeration of possible resources, so I'm reverting
// to an explicit enumeration of the possible resources.

// limitations of my approach:
// does not give which blog post it is. merely, the URL is given.
console.log("hello from pixel!");
const associated_resources_search = {
  // enum for the list of resources to parse.
  // add an entry here if you would like the url parser to be able to
  // identify another type of resource.
  BLOG: "/blog",
  ARTICLE: "/article",
  PRODUCT: "/products",
  COLLECTION: "/collections",
  PAGE: "/pages",
  OTHER: "/other",
};
function addDays(date, days) {
  // addds days to a date.
  date.setDate(date.getDate() + days);
  return date;
}

function detectDeviceType(s) {
  const IPAD = /(?=.*iPad)(?=.*Mac OS).*/gim;
  const OTHER_TABLET = /(?=.*linux)(?=.*Android).*/gim;
  const ANDROID_MOBILE =
    /(?=.*Linux)(?=.*Android).*|(?=.*Pixel).*|(?=.*SM-).*/gim;
  const APPLE_DESKTOP = /(?=.*Macintosh)(?=.*Mac OS).*/gim;
  const WINDOWS_DESKTOP = /(?=.*Windows)(?=.*Win64).*/gim;
  const LINUX_DESKTOP = /(?=.*Ubuntu)(?=.*Linux).*/gim;
  if (IPAD.test(s)) {
    return "ipad";
  } else if (OTHER_TABLET.test(s)) {
    return "other_tablet";
  } else if (ANDROID_MOBILE.test(s)) {
    return "android_mobile";
  } else if (APPLE_DESKTOP.test(s)) {
    return "apple_desktop";
  } else if (WINDOWS_DESKTOP.test(s)) {
    return "windows_desktop";
  } else if (LINUX_DESKTOP.test(s)) {
    return "linux_desktop";
  } else {
    return "UNRECOGNIZED_DEVICE_TYPE";
  }
}
register(({ analytics, browser, init, settings }) => {
  // get device type. sniff the User-Agent String using the above regex patterns.
  const user_agent_string = init.context.navigator.userAgent ?? "";
  const device_type = detectDeviceType(user_agent_string);
  const appUrl = settings.appUrl;
  const collectUrl = `${appUrl}/api/collect`;

  // Micro-function for sending events to server. Doesn't handle errors or responses.
  function sendData(payload) {
    fetch(collectUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", // Indicate that the body is JSON
      },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json())
      .then((data) => console.log(data))
      .catch((error) => console.error("Error fetching data: ", error));
  }

  analytics.subscribe("product_viewed", (event) => {
    let payload = {
      event_type: "product_viewed",
      client_id: event.clientId,
      timestamp: event.timestamp,
      product: event.data.productVariant,
      url: event.context.document.location.href,
      device_type: device_type,
    };
    console.log("product view about to fire!");
    sendData(payload);
  });

  // determine what the "resource" at this page is.
  // parse the location attribute, try to match it against the registered
  // resources in associated_resources_search
  analytics.subscribe("page_viewed", (event) => {
    let resource = associated_resources_search.OTHER;
    for (const key in associated_resources_search) {
      if (
        event.context.document.location.href.includes(
          associated_resources_search[key],
        )
      ) {
        resource = associated_resources_search[key];
      }
    }
    // create the payload of attributes of the event we are interested.
    let payload = {
      event_type: "page_viewed",
      client_id: event.clientId,
      timestamp: event.timestamp,
      page_url: event.context.document.location.href,
      associated_resource: resource,
      device_type: device_type,
    };
    console.log("page view about to fire!");
    sendData(payload);
  });

  analytics.subscribe("checkout_completed", (event) => {
    let payload = {
      event_type: "checkout_completed",
      client_id: event.clientId,
      timestamp: event.timestamp,
      products: event.data.checkout.lineItems,
      device_type: device_type,
    };
    console.log("checkout completed about to fire!");
    sendData(payload);
  });

  analytics.subscribe("product_added_to_cart", (event) => {
    let payload = {
      event_type: "product_added_to_cart",
      client_id: event.clientId,
      timestamp: event.timestamp,
      product: event.data.cartLine.merchandise,
      add_to_cart_source: event.context.document.referrer,
      device_type: device_type,
    };
    console.log("product added about to fire!");
    sendData(payload);
  });

  analytics.subscribe("checkout_started", (event) => {
    let payload = {
      event_type: "checkout_started",
      client_id: event.clientId,
      timestamp: event.timestamp,
      products: event.data.checkout.lineItems,
      device_type: device_type,
    };
    console.log("checkout started aout to fire!");
    sendData(payload);
  });
});
