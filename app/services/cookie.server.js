import db from "../db.server";

// TODO refactor so methods all follow the flow of updateLatestSession
export async function getUserbyID(customer_id) {
  console.log(
    "[cookie.server.js] looking up user with id: ",
    customer_id ?? "[ERROR] cookie.server::getUserbyID: userdata is undefined.",
  );
  if (customer_id) {
    const customer = await db.user.findUnique({
      where: {
        shopifyCustomerID: customer_id,
      },
    });
    console.log("found customer: ", customer);
    return customer;
  }
  console.log("did not find customer!");
  return null;
}

export async function createUser(userdata) {
  console.log(
    "[cookie.server.js] creating new user: ",
    userdata ?? "[ERROR] cookie.server::createUser: userdata is undefined.",
  );
  if (userdata) {
    const result = await db.user.create({
      data: {
        ...userdata,
      },
    });
    console.log("Created User: ", result);
    return result;
  }
  return null;
}

export async function updateLatestSession(userdata) {
  // Update latest session or create the user record if it doesn't exist yet
  const result = await db.user.upsert({
    where: {
      shopifyCustomerID: userdata.client_id,
    },
    update: {
      latestSession: new Date(userdata.latestSession),
      deviceType: userdata.deviceType ?? undefined,
    },
    create: {
      shopifyCustomerID: userdata.client_id,
      latestSession: new Date(userdata.latestSession),
      deviceType: userdata.deviceType ?? null,
    },
  });
  return result;
}
