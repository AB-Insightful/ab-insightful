//This file focuses on queries involving the variant table. Place relevant functions here.
import db from "../db.server";

//returns a list of variants that fall under a specific experiment id
//always sorts improvment percent as desc
export async function getVariants(expId)
{
    const variants = await db.variant.findMany({
        where: {
            experimentId: expId
        }
    })
    if (variants.length > 0)
    {
        return variants
    }
    //will return number of variants based of experiment id
    return []
}
