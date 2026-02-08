import path from "path";
import { promises as fs } from "fs";

export const loader = async ({ params }) => {
  const { filename } = params;
  
  //path to PDFs in app/routes/data/
  const filePath = path.join(process.cwd(), "app", "routes", "data", `${filename}.pdf`);
  
  try {
    const file = await fs.readFile(filePath);
    
    return new Response(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=${filename}.pdf`,
      },
    });
  } catch (error) {
    console.error(`PDF not found: ${filename}.pdf`, error);
    throw new Response("404 Error: PDF not found", { status: 404 });
  }
};