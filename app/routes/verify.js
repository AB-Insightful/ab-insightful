//handle GET requests for verification message (email, phone)
//after verification, this phone number/email will now be able
//to receive messages based on notification preferences

export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");  //token for verification
    const type  = url.searchParams.get("type");   //email or phone

    //set validated to true for entry in database where verificationToken = token
    //if it's an email
    if (type === "email") {
        await db.contactEmail.updateMany({
            where: { verificationToken: token },
            data:  { validated: true },
        });
    //if it's a phone message
    } else if (type === "phone") {
        await db.contactPhone.updateMany({
            where: { verificationToken: token },
            data:  { validated: true },
        });
    }
    return { ok: true };
};