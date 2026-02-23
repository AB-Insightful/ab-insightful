//contains functions to query information about the session. Currently scoped to assume there is only 1 session.
import db from "../db.server";

//function to query if there is a webPixelId stored. Could check any tuple since current understanding
// indicates that value being stored is the same for every session (same id)
export async function webPixelNotNull()
{
    //nifty typescript? shorthand that returns a boolean
    return !!(await db.session.findFirst({
        where: { 
            webPixelId: {
                not: null
            }
        }   
    }));
}