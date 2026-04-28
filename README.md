# AB Insightful 
<img width="1505" height="1964" alt="ExpTable" src="https://github.com/user-attachments/assets/f7bc70a4-91c0-4975-86fb-1a11aed007fb" />

## Synopsis


Welcome to AB-Insightful!  AB-Insightful helps Shopify merchants analyze customer engagement and customer conversion. AB-Insightful is unique from other A/B testing platforms because it is the first completely native-to-Shopify solution on the market that still offers robust customer tracking and insights. Our product utilizes Shopify’s theme extensions and Polaris Web Components Library to give merchants a familiar user interface and process for creating and deploying alternative websites that can be used for A/B testing. A core feature of our application is robust reporting. Merchants who install our app are able to view metrics such as conversion rates through intuitive UI and easy to read reports.

Our client was in need of an A/B testing application for conversion rate optimization to help improve sales on their platform.  However, other options at the time were not as fully featured as they would have liked, and costed enterprise level annual fees.  Therefore, AB-Insightful was created as an application that will which will improve the ability to objectively understand and optimize their website design.  This application offers better web performance by integrating with the Shopify development framework while simultaneously being a more affordable application than the alternative implementations.  Additionally, our team of students was able to treat this as an incredible learning experience, creating a new embedded application from start to scratch using software development strategies and techniques.

## Product Features
- [ ] Administrator interface – _Easily navigable interface that adheres to shopify style conventions.  Contains important links and all necessary information for using the product effectively_
- [ ] Built in app – _Easily downloadable and connectable with any shopify store_
- [ ] Core AB testing algorithm – _On site customer behavior tracking, allowing the user to see site visitors and track key events to help determine success of experiment _
- [ ] Reporting features  – _Statistical analysis, insights and experiment level reports help the user to gauge experiment success.  Users are able to see experiment status, modify experiments and view experiment progress_
- [ ] Database features – _Includes the ability to store experiment data, customer tracking data and performance metrics for later access


## Developer Instructions
Will provide development insight in greater detail during CSC 191. 
### Prerequisites
Before you begin, you'll need the following:
Node.js: Download and install it if you haven't already.
Shopify Partner Account: Create an account if you don't have one.
Test Store: Set up either a development store or a Shopify Plus sandbox store for testing your app.
Shopify CLI: Download and install it if you haven't already.
npm install -g @shopify/cli@latest
If you are on MacOS or linux, you may need to add "sudo" in front of the above command.

### Setup
```bash
# Clone the repository
git clone https://github.com/AB-Insightful/ab-insightful.git

# Navigate to project directory
cd <project-directory>

# Install dependencies
npm install
```
Additional libraries for statistical calculation and remix actions
run npm install @stdlib/random-base-beta (for calculating probability of best) run npm install @remix-run/node (for activating actions in jsx)
Also, be sure to to migrate the schema changes to the database as stated above

### Building

Build the app by running the command below with the package manager of your choice:
Using yarn:
`yarn build`
Using npm:
`npm run build`
Using pnpm:
`pnpm run build`

### Testing
_Include steps for running automated or manual tests._

```bash
# Run unit tests
npm test
```
_Add any test coverage notes or frameworks used (e.g., Jest, Mocha)._
### Deploying
Will further describe how to deploy the project (e.g., using Docker, Shopify App CLI, or cloud provider setup). Placeholder for deployment instructions until completion of CSC 191.

## Product Design

![Home Page](./docs/images/homePage.png)

![Create Experiment Page](./docs/images/createExperiment.png)
![Experiment List Page](./docs/images/experimentsList.png)
![Reports Page](./docs/images/reportsPage.png)



## Database
_The database is capable of storing experiment data, analysis of the experiment, and relevant user and cookie data. Experiment data is used to track the current experiment, the relevant changes between the main and base cases, and settings for end condition, status, and more.  During the runtime of the experiment, specified goal data is stored to help calculate the analysis of the data.  This is able to determine if the experiment variant is successful or detrimental.  Finally, users and their relevant cookie data are stored to store if they are a part of the experiment, if they are a part of the base or variant, and if they complete the specified goal._

![ERD](./docs/images/ERD.png)

---
## Contributors
| Name     | Role                 | GitHub      |
| -------- | -------------------- | ----------- |
| _Benjamin Church_ | _Full Stack / Graphic Designer_ | _@ChurchDuck1_ |
| _Emmanuel Rodriguez_ | _Full Stack_  | _@HeadlessChickenFajita_ & @melRodCSUS|
| _Matthew Tagintsev_ | _Full Stack_    | _@tagintsevm_ |
| _Paul Felker_ | _Full Stack_    | _@pfelker13_ |
| _Ryan Martinez_ | _Architecture / Backend_    | _@ryanmart25_ |
| _Tatiana Neville_ | _Project Manager / Full Stack_    | _@RicePaperDolls_ |
| _Tosh Brockway Roberts_ | _Technical Lead / Full Stack_    | _@toshrb_ |
---
