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
  // todo, add some sort of client side cache. It seems like on every page view,
  // everything defined in here will fire. So we could potentially be hammering our APIs with requests.
  // We don't want to send a new request when we already know the user is registered.
  // Get shop from the current page URL or from pixel context

  // get device type. sniff the User-Agent String using the above regex patterns.
  const user_agent_string = init.context.navigator.userAgent ?? "";
  const device_type = detectDeviceType(user_agent_string);
  const appUrl = settings.appUrl;
  const collectUrl = `${appUrl}/api/collect`;

  // Below likely not needed
  // const cookie_name = "exp_table_identification_cookie";
  // const cookieAPIURL = `${appUrl}/api/pixel`;
  // below is a refactor of the block-commented code.
  // let customer_id = init?.data?.customer?.id ?? "";

  // Likely removing all below code as it is not needed. Shopify already has a client_id cookie that is reliable.
  // browser.cookie.get(cookie_name).then((cookie) => {
  //   if (cookie == "") {
  //     if (customer_id == "") { // TODO need to add a way to create a customer id, so we can track people with no account. My guess is we fallback to the browser's cookie API.
  //       throw new Error("User has no ID. They likely don't have an account."); // for now, throw and catch.
  //     } else {
  //       console.log("performing cookie get with url: ",cookieAPIURL +"?"+new URLSearchParams({ customer_id: customer_id }).toString());
  //       return fetch( // check to see if the user exists within the database
  //         cookieAPIURL +"?"+
  //           new URLSearchParams({ customer_id: customer_id }).toString(),
  //         {
  //           method: "GET",
  //         },
  //       ).then(async (response) => {
  //         // a note on error handling:
  //         // a 404 is not a critical error, and is sometimes expected to happen. Thus, only 500s are treated as critical errors.
  //         if (response.status == 500) {
  //           // an error occurred, throw and catch with the server's message.
  //           const data = await response.text();
  //           throw new Error(
  //             `[web-pixel/index.js] @GET /api/pixel?<customer_id> Error: ${response.status} message: ${data}`,
  //           );
  //         }
  //         else if(response.status == 400){
  //           console.log("I sent a bad request!!!");
  //         }
  //         else if (response.status == 404) {
  //           // user is not known to the database. post, and create the cookie.
  //           console.log("@index.js server couldn't find that user!About to perform the post", JSON.stringify({shopifyCustomerID: customer_id, device_type:device_type,}));
  //           return fetch(cookieAPIURL, {
  //             method: "POST",
  //             headers: {
  //               "Content-Type": "application/json",
  //             },
  //             body: JSON.stringify({
  //               shopifyCustomerID: customer_id,
  //               deviceType: device_type,
  //             }),
  //           })
  //             .then(async (response) => {
  //               const data = await response.json();
  //               if (!response.ok) {
  //                 throw new Error(`error @POST /api/cookie: ${response.status}, message: ${data}`);
  //               }
  //               return data;
  //             })
  //             .then((data) => { // user was found. create the cookie.
  //               browser.cookie.set(
  //                 `${cookie_name}=${data.customer_id}; expires=${addDays(new Date(), 20)};`, // set the cookie to expire 20 days from now.
  //               );
  //             });
  //         }
  //       });
  //     }
  //   }else{ // a cookie exists. Send a PATCH to the server to update their latestSession
  //     return fetch(cookieAPIURL,{
  //       method: "PATCH",
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //       body: JSON.stringify({
  //         customer_id: customer_id,
  //         latestSession: Date.now(),
  //       })
  //     } )
  //     .then(async res => {
  //       if(!res.ok){
  //         const text = await res.text();
  //         throw new Error(`@PATCH ${cookieAPIURL}:  Failed to update record with custoemr id:  ${customer_id}. Status: ${res.status}: ${text} `);
  //       }
  //       return res.json();
  //     })
  //     .then(data => { // what should i do now?
  //       console.log(`updated user with id: ${customer_id}\n data: \n${data}`);
  //     })
  //   }
  // })
  // .catch(error => {
  //   console.log("an error occurred: ", error);
  // });
  /*
  // check if our user has a cookie
  browser.cookie
    .get("user_id_exptable")
    .then((cookie) => {
      if (cookie == "") {
        // the cookie doesn't exist. We need to register this user
        let customer_id = init?.data?.customer?.id ?? "invalid id"; // get the customer's ID.
        if (customer_id == "invalid id") {
          console.log(
            "This customer doesn't have an ID. We can't use this to create the cookie. Don't send the request",
          );
          return;
        } else {
          // first, check with the server to see if the user already exists within the database
          console.log(
            "[cookie.server.js] About to send GET request for user: ",
            customer_id,
          );
          return fetch(
            cookieURL +
              new URLSearchParams({ customer_id: customer_id }).toString(),
            {
              method: "GET",
            },
          )
            .then((response) => {
              if (response.status == 200) {
                // the user does exist in the database. The server will send information for creating the cookie, and then the pixel will update the "last seen" field in the database.
                // response should have a body:
                /*
                body: {
                  customer_id:customer_id,
                  device_type: device_type,
                  last_seen: <DateTime>,
                  lastest_session: <DateTime>

                }
                // we should create a cookie with custoemr_id, and then send a PATCH request to update the record with new last_seen and latest_session
              
                return response
                  .json()
                  .then((data) => {
                    browser.cookie.set(
                      `user_id_exptable=${data.customer_id}; expires=${addDays(Date.now(), 20)};`, // set the cookie to expire 20 days from now.
                    );
                    // TODO replace with sending a patch request
                  })
                  .catch((error) => {
                    console.log("an error occurred: ", error);
                  });
              } else if (response.status == 404) {
                // the user does not exist in the database, we can consider this to be a new user. Send the post request, and create the cookie
                console.log("About to send the post request for the cookie.");
                return fetch(cookieURL, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    customer_id: customer_id,
                    device_type: device_type,
                  }),
                })
                  .then((response) => {
                    return response.json();
                  })
                  .then((data) => {
                    browser.cookie.set(
                      `user_id_exptable=${data.customer_id}; expires=${addDays(Date.now(), 20)};`, // set the cookie to expire 20 days from now.
                    );
                  })
                  .catch((error) => {
                    console.log(`an error occurred: ${error}`);
                  });
              } else {
                // an error occurred, likely a 500.
                console.log("an error occurred");
                // TODO replace with proper error handling
              }
            })
            .catch((error) => {
              console.log("An error occurred", error);
            });
        }
      } else {
        // send a PATCH to update the LAST_SEEN
      }
    })
    .catch((err) => {
      console.log("an error occurred", err);
    });
*/

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
