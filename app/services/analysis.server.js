//database queries and functions tied to analysis table. Place relevant functions here.
import db from "../db.server";

//get analysis by id 
export async function getAnalysisById(id){

    //needs to be the latest info ??
    if (id) {
    const experimentAnalysis = await db.analysis.findUnique({
      where: {
        id: id,
      },
      orderBy: {
        probabilityOfBeingBest: "desc"
      }
    });
    return experimentAnalysis;
  }
  return null;
}

//takes an array of variant tuples and compares which has the largest 
export async function getMaxProbabilityOfBest(variantList){

}

//create function that takes an analysis object with a list of variants, then selects the largest one. ==> returns probability to be best and variant name