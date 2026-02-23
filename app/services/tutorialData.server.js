import db from "../db.server";
import { Prisma } from "@prisma/client";

//server side functions involved in queries tied to tutorialData
//Note, the scope of this settings page assumes there is only 1 setting tuple, and there is currently no feature to detect which user is associated
//with the app. NEEDS TO BE CHANGED if we support multiple users tied to settings. 

//queries the first tuple in the tutorial array as it assumes there is only 1 settings stored
//NOTE: Query Must be changed if we create multiple users as there will be multiple settings per user in design. 
export async function getTutorialData()
{
    if(db.TutorialData) {
        return db.TutorialData.findFirst(
        {
            where: {
                id: 1 //hard coded to 1 since it assumes there will always be a Tutorial Data entry
            }
        });
    }
    
}
//changes 
export async function setViewedListExp(tutId, inputData) {

    return await db.tutorialData.update({
        where : { id: tutId },
        data : {
            viewedListExperiment: inputData
        }
    });
}

export async function setGeneralSettings(tutId, inputData) {

    return await db.tutorialData.update({
        where : { id: tutId },
        data : {
            generalSettings: inputData
        }
    });
}

export async function setViewedReportsPage(tutId, inputData) {

    return await db.tutorialData.update({
        where : { id: tutId },
        data : {
            viewedReportsPage: inputData
        }
    });
}

export async function setCreateExpPage(tutId, inputData) {

    return await db.tutorialData.update({
        where : { id: tutId },
        data : {
            createExperiment: inputData
        }
    });
}