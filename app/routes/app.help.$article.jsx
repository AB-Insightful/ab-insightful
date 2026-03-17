import { useLoaderData } from "react-router";
import ReactDOM from "react-dom";
import Markdown from "marked-react";
import path from "path";
import { promises as fs } from "fs";

export const loader = async ({ params }) => {
  const { filename } = params;

  //path to MDs in app/routes/data/
  const filePath = path.join(
    process.cwd(),
    "app",
    "routes",
    "data",
    `${filename}.md`,
  );

  try {
    const article = await fs.readFile(filePath);

    return { article };
  } catch (error) {
    const article = "# The requested article was not found";
    return { article };
  }
};

export default function Test() {
  // Lookup requested article
  const { article } = useLoaderData();

  return (
    <s-page heading="Article" inlineSize="small">
      <s-section>
        <Markdown>{article}</Markdown>
      </s-section>
    </s-page>
  );
}
