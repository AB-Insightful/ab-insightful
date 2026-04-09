//code for querying project related data (i.e. defaultGoal, notificationToggles)
//currently, this defaults to the first project every created (i.e. the seed data)
//would need to be scaled to multiple stores and have a system to check what project is actively running on admin
import db from "../db.server";

//sets the emailNotifEnabled Boolean in Project to true or false based on input 
export async function setEmailNotifToggle(setOn, project_id = 1)
{
    const updated = await db.project.update({
            where: {
                id : project_id
            },
            data:{
                emailNotifEnabled : setOn
            }
    });

    return updated;
}

export async function getEmailNotifToggle(notifId = 1) {


    const project = await db.project.findUnique({
        where : {id:notifId},
        select: {emailNotifEnabled:true},
    });
       
    if (!project) {
        console.log("Failed to find getEmailNotifToggle() value");
        return null;
    }
    else
    {
        return project.emailNotifEnabled;
    } 
}

export async function getSMSNotifToggle(notifId = 1)
{
    const project = await db.project.findUnique({
        where : {id:notifId},
        select: {smsNotifEnabled:true},
    });
       
    if (!project) {
        console.log("Failed to find getSMSNotifToggle() value");
        return null;
    }
    else
    {
        return project.smsNotifEnabled;
    } 

}

export async function setSMSNotifToggle(setOn, project_id = 1)
{
    const updated = await db.project.update({
            where: {
                id : project_id
            },
            data:{
                smsNotifEnabled : setOn
            }
    });

    return updated;
}


