import type { ResultItem } from './analyze.ts';
import { SKILL_BY_ID, type Category } from './skills.ts';

export interface PlanDay {
  day: number;
  /** Gap(s) this day serves: ResultItem keys, for jumping back to JD evidence. */
  gapKeys: string[];
  skillIds: string[];
  kind: 'learn' | 'project' | 'checkpoint';
  title: string;
  task: string;
  output: string;
  selfCheck: string;
  minutes: number;
  dependsOn: number[];
}

export interface Plan {
  days: PlanDay[];
  gaps: { key: string; skillId: string; name: string; label: string; days: number[] }[];
  mode: 'none' | 'project' | 'checkpoints';
  projectTitle?: string;
  totalMinutes: number;
}

interface Step { title: string; task: string; output: string; check: string; min: number }
interface Track { steps: Step[]; capstone: string; checkpoint: string }

const s = (title: string, task: string, output: string, check: string, min = 35): Step => ({ title, task, output, check, min });

// Curated tracks for frequently requested skills. Each step is a distinct, concrete session.
const TRACKS: Record<string, Track> = {
  docker: {
    steps: [
      s('Run your first containers', 'Install Docker Desktop (or Docker Engine), then run hello-world, nginx and an interactive python:3.12-slim container. Use ps, logs, stop and rm.', 'A notes file with the 6 commands you used and what each did.', 'Can you explain the difference between an image and a container in one sentence?', 30),
      s('Write a Dockerfile', 'Containerise a small existing app of yours (or a 20-line Flask/Express app). Use a slim base image, COPY, RUN, EXPOSE and CMD.', 'A Dockerfile that builds and serves your app on localhost.', 'Does `docker build` succeed from a clean clone, and does the app respond?', 40),
      s('Layers, cache and image size', 'Reorder the Dockerfile so dependencies install before source is copied, add a .dockerignore, and compare image sizes with `docker images`.', 'Before/after image size recorded in your notes.', 'Can you say why copying package files first speeds up rebuilds?', 35),
      s('Volumes, ports and env vars', 'Pass configuration through environment variables and persist data with a named volume. Restart the container and confirm the data survives.', 'A run command (or script) using -p, -e and -v.', 'Does your data survive `docker rm` and a fresh `docker run`?', 35),
      s('Multi-service setup with Compose', 'Write docker-compose.yml with your app plus a database (Postgres or MongoDB). Connect them using the service name as host.', 'A compose file that starts both services with one command.', 'Can a teammate run `docker compose up` and reach the app without extra steps?', 45),
      s('Debug a broken container', 'Break something on purpose (wrong port, missing env var), then diagnose using `docker logs`, `docker exec -it … sh` and `docker inspect`.', 'A 5-line troubleshooting checklist in your README.', 'Could you find the cause of a crash-looping container in under 5 minutes?', 30),
    ],
    capstone: 'package the service in a Docker image and add a docker-compose.yml that also starts its database',
    checkpoint: 'From a clean clone, `docker compose up` starts your app and its database; record a 60-second screen capture of it working.',
  },
  'github-actions': {
    steps: [
      s('Anatomy of a workflow', 'In a practice repo, add .github/workflows/ci.yml that runs on push and prints the Node/Python version. Read the run log on GitHub.', 'A green workflow run on GitHub.', 'Can you name what `on`, `jobs`, `runs-on` and `steps` each control?', 30),
      s('Run tests in CI', 'Use actions/checkout and actions/setup-node (or setup-python), install dependencies and run your test command. Make one test fail and see the red run.', 'A workflow that fails when a test fails.', 'Does a failing test block the run (red ✗) as expected?', 40),
      s('Cache and matrix builds', 'Add dependency caching and a matrix over two runtime versions. Compare run times before and after caching.', 'Workflow with cache + matrix, with timings in your notes.', 'Can you explain what the cache key is based on?', 35),
      s('Secrets and environment variables', 'Store a dummy token as a repository secret and read it in a step without printing it. Add a job-level env var.', 'A step that uses ${{ secrets.NAME }} safely.', 'Does the log show *** instead of the secret value?', 30),
      s('Build an artifact on every push', 'Add a build job that depends on the test job (`needs:`) and uploads a build artifact or builds a Docker image.', 'A two-job pipeline: test → build.', 'Does the build job skip when tests fail?', 40),
      s('Status badge and pull-request checks', 'Add the workflow badge to your README and enable branch protection so PRs need the check to pass. Open a PR to see it.', 'A PR showing your required check.', 'Could you explain to a teammate why their PR is blocked?', 30),
    ],
    capstone: 'add a GitHub Actions workflow that runs the tests and builds the project on every push',
    checkpoint: 'Open a pull request in a practice repo where your workflow runs tests, caches dependencies and blocks merging on failure.',
  },
  kubernetes: {
    steps: [
      s('Local cluster and kubectl', 'Install kind or minikube, create a cluster and explore it with kubectl get nodes/pods -A and kubectl describe.', 'A running local cluster and a cheat-sheet of 8 kubectl commands.', 'Can you explain node vs pod vs container?', 40),
      s('Deploy with a Deployment', 'Write a Deployment manifest for an nginx or your own image with 2 replicas; apply it and delete a pod to watch it come back.', 'deployment.yaml that keeps 2 pods running.', 'What restarted the pod you deleted?', 35),
      s('Expose it with a Service', 'Add a ClusterIP Service and reach it with kubectl port-forward. Then try NodePort.', 'service.yaml and a working curl.', 'Why do pods need a Service in front of them?', 35),
      s('ConfigMaps and Secrets', 'Move configuration into a ConfigMap and a Secret and mount them as env vars.', 'Manifests with config separated from the image.', 'Can you change config without rebuilding the image?', 35),
      s('Rolling updates and rollbacks', 'Update the image tag, watch the rollout, then roll back with kubectl rollout undo.', 'Notes on rollout status and history output.', 'Could you undo a bad deploy in one command?', 30),
      s('Probes and resource limits', 'Add readiness/liveness probes and CPU/memory requests and limits; break the probe to see what happens.', 'A production-shaped manifest.', 'What is the difference between readiness and liveness?', 40),
    ],
    capstone: 'deploy the service to a local Kubernetes cluster with a Deployment, Service and probes',
    checkpoint: 'Deploy an app to a local kind/minikube cluster, perform a rolling update and a rollback, and capture the commands and output.',
  },
  aws: {
    steps: [
      s('Account safety first', 'Create a free-tier account (or use AWS Educate/Skill Builder labs), enable MFA, set a $1 budget alert and create an IAM user instead of using root.', 'Budget alert + IAM user configured.', 'Can you explain why you never use the root account day to day?', 30),
      s('Store files in S3', 'Create an S3 bucket, upload and download files with the AWS CLI, and host a static HTML page.', 'A static page served from S3.', 'Is the bucket public only where it needs to be?', 35),
      s('Launch and connect to EC2', 'Launch a t2/t3.micro instance, SSH in, install nginx and open port 80 in the security group. Stop it afterwards.', 'Screenshot of your page served from EC2.', 'What does a security group do?', 45),
      s('IAM roles and policies', 'Write a least-privilege policy that only allows reading one bucket and attach it to a role for EC2.', 'A JSON policy in your notes.', 'Can you read a policy and say what it allows?', 35),
      s('Serverless with Lambda', 'Create a Lambda function behind a function URL or API Gateway that returns JSON.', 'A public endpoint returning JSON.', 'When would you choose Lambda over EC2?', 40),
      s('Clean up and cost check', 'Delete what you created, check Billing for charges and write a one-page summary of the services you used.', 'A summary note and a clean account.', 'Is your bill still at $0?', 30),
    ],
    capstone: 'deploy the service to AWS (S3 for static files, plus EC2 or Lambda for the backend)',
    checkpoint: 'Host a static page on S3 and a JSON endpoint on Lambda, then show the cleaned-up account with $0 spend.',
  },
  sql: {
    steps: [
      s('Set up {name} and a sample schema', 'Install {name} (or use an online sandbox) and create tables for students, companies and applications with primary and foreign keys.', 'A schema.sql you can re-run.', 'Can you explain what a foreign key prevents?', 35),
      s('Filter, sort and aggregate', 'Write 10 queries using WHERE, ORDER BY, GROUP BY, HAVING and COUNT/AVG on your tables.', 'queries.sql with 10 commented queries.', 'Can you write “companies with more than 3 applicants” without looking?', 40),
      s('Joins', 'Practise INNER, LEFT and self joins; find students who applied nowhere.', '5 join queries with expected output noted.', 'When does LEFT JOIN return NULLs?', 40),
      s('Subqueries and window functions', 'Rank students by applications using ROW_NUMBER/RANK and rewrite one subquery as a CTE.', '3 queries using CTEs and window functions.', 'What is the difference between RANK and DENSE_RANK?', 40),
      s('Indexes and EXPLAIN', 'Insert 50k rows with a script, time a slow query, add an index and compare EXPLAIN output.', 'Before/after timings in your notes.', 'Why can too many indexes slow down writes?', 40),
      s('Transactions', 'Write a transfer-style transaction with BEGIN/COMMIT/ROLLBACK and test a failure halfway.', 'A script showing rollback in action.', 'What does atomicity guarantee?', 30),
    ],
    capstone: 'store the project data in {name} with a migration/schema file and at least one indexed query',
    checkpoint: 'Solve 5 timed SQL problems (joins, GROUP BY, window functions) on LeetCode or HackerRank and save your solutions.',
  },
  react: {
    steps: [
      s('Components and props', 'Create a Vite + React app and build a JobCard component that receives title, company and skills as props.', 'A page rendering 3 JobCards from an array.', 'Can you explain props vs state?', 35),
      s('State and events', 'Add a “Save” toggle and a filter input using useState; derive the filtered list instead of storing it.', 'Interactive filtering of your cards.', 'Why should derived data not live in its own state?', 35),
      s('Effects and fetching data', 'Fetch job data from a JSON file or public API with useEffect; handle loading and error states.', 'A list loaded from the network with a loading message.', 'What does the dependency array control?', 40),
      s('Forms and controlled inputs', 'Build an “Add job” form with validation messages.', 'A form that adds a card and shows errors.', 'What makes an input “controlled”?', 35),
      s('Routing and shared state', 'Add React Router with a list page and a detail page; lift saved jobs into context.', 'Two routes sharing saved state.', 'When is context better than prop drilling?', 40),
      s('Test and deploy', 'Write two component tests with React Testing Library and deploy to Vercel or Netlify.', 'A live URL and passing tests.', 'Does your test check behaviour rather than implementation?', 40),
    ],
    capstone: 'build the user interface in React with at least two routes and a form',
    checkpoint: 'Deploy a small React app with routing, a validated form and one component test, and share the live URL.',
  },
  typescript: {
    steps: [
      s('Types for everyday values', 'Convert a small JS file to TS; type function params, return values, arrays and objects with interfaces.', 'A file that compiles with `strict: true`.', 'When do you need an explicit type annotation?', 35),
      s('Unions and narrowing', 'Model a result as `{ ok: true, data } | { ok: false, error }` and narrow it with if/switch.', 'A typed result handler with no `any`.', 'What does narrowing mean?', 35),
      s('Generics', 'Write a generic `groupBy<T, K>` and a typed fetch helper `getJson<T>()`.', 'Two generic utilities with tests or examples.', 'Why not just use `any`?', 40),
      s('Typing a React or Node module', 'Add types to a component or Express route, including event handlers and request bodies.', 'A typed module that compiles cleanly.', 'Can you read a TS error message and fix it quickly?', 40),
      s('Utility types', 'Use Partial, Pick, Omit, Record and ReadonlyArray in a small domain model.', 'A types.ts using 5 utility types.', 'When is Omit better than writing a new interface?', 30),
      s('tsconfig and tooling', 'Tune tsconfig (strict, noUncheckedIndexedAccess), add a typecheck script and run it in CI or a pre-commit hook.', 'A `npm run typecheck` script.', 'What does `strict` actually switch on?', 30),
    ],
    capstone: 'write the project in TypeScript with strict mode and a typecheck script',
    checkpoint: 'Convert one of your JavaScript projects to strict TypeScript with zero `any` and link the diff.',
  },
  nodejs: {
    steps: [
      s('Node runtime basics', 'Write scripts using fs/promises, path and process.argv; read a JSON file and print a summary.', 'A CLI script that takes a file path.', 'What is the event loop doing while a file is read?', 30),
      s('HTTP server with Express', 'Create an Express server with GET/POST routes for a “jobs” resource stored in memory.', 'A server you can call with curl.', 'What does `express.json()` do?', 40),
      s('Async patterns and errors', 'Convert callbacks to async/await, add an error-handling middleware and return proper status codes.', 'Consistent JSON error responses.', 'What happens to an unhandled promise rejection?', 35),
      s('Persist data', 'Replace the in-memory array with a database (SQLite, Postgres or MongoDB) using a small data layer.', 'CRUD routes backed by a database.', 'Where would you put validation?', 45),
      s('Environment config and security basics', 'Load config from env vars, add input validation and basic rate limiting/helmet.', 'A .env.example and validated routes.', 'Why must secrets stay out of git?', 30),
      s('Test the API', 'Write API tests with node:test or Jest + supertest for success and error cases.', '5 passing API tests.', 'Do your tests cover at least one failure case per route?', 40),
    ],
    capstone: 'build the backend API in Node.js with validated routes and tests',
    checkpoint: 'Publish a small Node.js REST API with tests and a README showing curl examples.',
  },
  python: {
    steps: [
      s('Core syntax refresher', 'Solve 6 small problems using lists, dicts, comprehensions and f-strings.', 'A practice.py with 6 solved functions.', 'Can you write a dict comprehension without looking it up?', 35),
      s('Functions, modules and packages', 'Split code into modules, add type hints and a `if __name__ == "__main__":` entry point.', 'A small package with 2 modules.', 'What does the main guard prevent?', 30),
      s('Files, JSON and errors', 'Read a CSV/JSON, handle missing files with try/except and write a cleaned output file.', 'A script that cleans one real file.', 'Which exception do you catch, and why not a bare except?', 35),
      s('Virtual environments and dependencies', 'Create a venv, install requests, pin versions in requirements.txt and call a public API.', 'requirements.txt + a working API script.', 'Why use a virtual environment per project?', 30),
      s('Classes and dataclasses', 'Model a Job and Application with dataclasses and add methods with simple validation.', 'models.py with 2 dataclasses.', 'When is a dataclass better than a dict?', 35),
      s('Testing with pytest', 'Write pytest tests for your functions, including one parametrised test.', 'Passing `pytest` run.', 'What does parametrize save you from?', 35),
    ],
    capstone: 'write the core logic in Python with type hints and pytest tests',
    checkpoint: 'Push a Python script that reads a real CSV, cleans it, and is covered by pytest tests.',
  },
  git: {
    steps: [
      s('Commits that tell a story', 'In a practice repo make 5 small commits with clear messages; use status, diff and log --oneline.', 'A repo with a readable history.', 'Can you explain staging vs committing?', 30),
      s('Branches and merging', 'Create a feature branch, make changes and merge it; then create and resolve a merge conflict.', 'A resolved conflict in your history.', 'What does a conflict marker mean?', 35),
      s('Remote collaboration', 'Push to GitHub, open a pull request, review it and merge.', 'A merged PR with a description.', 'What is the difference between fetch and pull?', 35),
      s('Undoing mistakes', 'Practise restore, reset --soft, revert and reflog on throwaway commits.', 'A cheat-sheet: which undo command for which situation.', 'Which undo is safe on a shared branch?', 35),
      s('Rebase and clean history', 'Rebase a feature branch on main and squash fixup commits.', 'A linear history on your branch.', 'When should you avoid rebasing?', 35),
      s('Team workflow', 'Write a CONTRIBUTING.md with branch naming, commit style and PR checklist; add a .gitignore.', 'CONTRIBUTING.md and .gitignore.', 'Would a new teammate know how to contribute?', 30),
    ],
    capstone: 'run the project with feature branches, pull requests and a clean commit history',
    checkpoint: 'Show a practice repo with a resolved merge conflict, a reviewed pull request and a reverted commit.',
  },
  linux: {
    steps: [
      s('Navigate and inspect', 'Use a Linux machine, WSL or a cloud shell: practise ls, cd, find, cat, less, head/tail, grep.', 'A cheat-sheet of 12 commands with examples.', 'Can you find all .log files containing “error”?', 30),
      s('Permissions and users', 'Create files, change permissions with chmod/chown, and explain rwx octal values.', 'Notes explaining 755 and 644.', 'Why shouldn’t a web app run as root?', 30),
      s('Processes and services', 'Use ps, top, kill, systemctl/service and journalctl to inspect a running service.', 'A note on stopping and restarting a service.', 'What is the difference between SIGTERM and SIGKILL?', 35),
      s('Pipes and text processing', 'Combine grep, sort, uniq, cut, awk and wc to summarise an access log.', 'A one-liner that finds the top 5 IPs.', 'Can you explain each stage of your pipe?', 40),
      s('Shell scripting', 'Write a bash script with arguments, a loop and error checks that backs up a folder.', 'backup.sh with usage message.', 'What does `set -euo pipefail` change?', 40),
      s('Networking and SSH', 'Use ssh, scp, curl, ss/netstat and ping; set up SSH keys.', 'Key-based login working.', 'How do you find which process uses port 3000?', 35),
    ],
    capstone: 'deploy and operate the service from a Linux shell with a setup script',
    checkpoint: 'Write a bash script that summarises a log file and show it running on Linux or WSL.',
  },
  'rest-api': {
    steps: [
      s('Resources and verbs', 'Design endpoints for a “job applications” resource: list, get, create, update, delete. Write them as a table.', 'An endpoint table with methods and paths.', 'Why is POST /applications better than /createApplication?', 30),
      s('Status codes and errors', 'Pick status codes for 10 scenarios (created, validation error, not found, conflict…) and a consistent error body.', 'An error-format spec.', 'When do you return 409 vs 422?', 30),
      s('Build the endpoints', 'Implement the API in your stack of choice with in-memory storage.', 'Working CRUD endpoints.', 'Do all endpoints return the documented status codes?', 45),
      s('Pagination, filtering and validation', 'Add ?page & ?limit, a filter by status, and request body validation.', 'Paginated list endpoint.', 'What does your API return on page 9999?', 40),
      s('Document with OpenAPI', 'Write an OpenAPI (Swagger) spec and view it in Swagger UI or Postman.', 'openapi.yaml.', 'Could someone call your API using only the docs?', 35),
      s('Auth and testing', 'Protect write routes with a simple token/JWT check and test with Postman or automated tests.', 'A Postman collection or test file.', 'What is the difference between 401 and 403?', 40),
    ],
    capstone: 'expose a documented REST API with proper status codes',
    checkpoint: 'Publish a REST API with an OpenAPI spec and a Postman collection that covers success and error cases.',
  },
  mongodb: {
    steps: [
      s('Documents and collections', 'Use MongoDB Atlas free tier or a local container; insert and query documents in mongosh.', '10 sample documents and 5 queries.', 'How is a document different from a table row?', 35),
      s('Query operators and projection', 'Practise $in, $gt, $regex, projection, sort and limit.', 'queries.js with commented results.', 'How do you return only two fields?', 35),
      s('Schema design', 'Decide embed vs reference for students, applications and companies; write the reasoning.', 'A one-page schema design.', 'When does embedding become a problem?', 35),
      s('Aggregation pipeline', 'Build a pipeline with $match, $group, $sort and $lookup to count applications per company.', 'A working aggregation.', 'What does $lookup correspond to in SQL?', 40),
      s('Indexes', 'Add indexes and compare explain() output for a filtered query.', 'Before/after explain notes.', 'How do you tell a query used an index?', 35),
      s('Use it from code', 'Connect from Node (Mongoose or driver) or Python (PyMongo) and implement CRUD.', 'A small data access module.', 'Where do you keep the connection string?', 40),
    ],
    capstone: 'store project data in MongoDB with an aggregation for a summary view',
    checkpoint: 'Show a MongoDB aggregation pipeline that powers a summary endpoint, with indexes explained.',
  },
  java: {
    steps: [
      s('Syntax and types refresher', 'Write classes with fields, constructors and methods; practise String, arrays and control flow.', '5 solved exercises in a Maven/Gradle project.', 'Can you explain primitive vs reference types?', 35),
      s('OOP in Java', 'Model Job, Applicant and Application with encapsulation, an interface and inheritance.', 'A small domain model with tests or a main().', 'When would you use an interface over an abstract class?', 40),
      s('Collections and generics', 'Use List, Map, Set and generics; sort with Comparator and use streams for filtering.', '5 collection/stream exercises.', 'HashMap vs TreeMap: when does each fit?', 40),
      s('Exceptions and I/O', 'Read a CSV with try-with-resources and handle checked exceptions properly.', 'A file reader with clean error handling.', 'Checked vs unchecked exceptions?', 35),
      s('Unit tests with JUnit', 'Write JUnit 5 tests including assertThrows and parameterised tests.', 'Passing test suite.', 'What makes a test independent?', 35),
      s('Build tools', 'Package the project as a runnable JAR with Maven or Gradle and add a dependency.', 'A runnable JAR.', 'What does `mvn package` do step by step?', 30),
    ],
    capstone: 'implement the core service in Java with JUnit tests',
    checkpoint: 'Push a Java project with a small domain model, streams usage and a JUnit test suite.',
  },
  redis: {
    steps: [
      s('Data types', 'Run Redis in Docker; practise strings, hashes, lists, sets and sorted sets in redis-cli.', 'A cheat-sheet with one command per type.', 'Which type would you use for a leaderboard?', 35),
      s('Expiry and caching', 'Use SET with EX and TTL; cache a slow function result from your app.', 'A cached endpoint with measured speed-up.', 'What happens when a key expires?', 40),
      s('Cache invalidation', 'Implement cache-aside with invalidation on update.', 'Updates that clear stale cache.', 'Why is invalidation hard?', 35),
      s('Rate limiting', 'Build a fixed-window rate limiter with INCR and EXPIRE.', 'A rate-limited route.', 'What does the user see when limited?', 35),
      s('Pub/Sub or streams', 'Send messages between two scripts with Pub/Sub.', 'Two scripts communicating.', 'When would you not use Pub/Sub?', 30),
      s('Persistence and memory', 'Read about RDB vs AOF and set a maxmemory policy; write a summary.', 'A summary note.', 'What happens when Redis runs out of memory?', 30),
    ],
    capstone: 'add a Redis cache and rate limiter to the API',
    checkpoint: 'Demonstrate an endpoint that is cached in Redis and rate-limited, with timings.',
  },
  graphql: {
    steps: [
      s('Schema and queries', 'Write a schema with Job and Company types and run queries in a GraphQL playground.', 'schema.graphql.', 'How is a GraphQL query different from a REST call?', 35),
      s('Resolvers', 'Implement resolvers with Apollo Server or graphql-yoga backed by in-memory data.', 'Working queries.', 'What arguments does a resolver receive?', 40),
      s('Mutations and input types', 'Add create/update mutations with input types and validation.', 'Two working mutations.', 'Why use input types?', 35),
      s('N+1 and DataLoader', 'Log resolver calls for nested queries and fix N+1 with DataLoader.', 'Before/after call counts.', 'What is the N+1 problem?', 40),
      s('Errors and auth', 'Return typed errors and protect a mutation with context-based auth.', 'A protected mutation.', 'Where does auth belong in GraphQL?', 35),
      s('Client usage', 'Call your API from a frontend with Apollo Client or fetch.', 'A page showing GraphQL data.', 'How does the client cache results?', 35),
    ],
    capstone: 'expose the project data through a GraphQL API with one mutation',
    checkpoint: 'Publish a GraphQL API with queries, a mutation and a DataLoader fix for N+1.',
  },
  'machine-learning': {
    steps: [
      s('Problem framing and data split', 'Pick a public dataset (e.g. placement data on Kaggle), define the target and split train/validation/test.', 'A notebook with the split and a baseline.', 'Why must the test set stay untouched?', 40),
      s('Baseline models', 'Train logistic regression and a decision tree with scikit-learn; record accuracy and F1.', 'A results table for 2 models.', 'Why is accuracy misleading on imbalanced data?', 40),
      s('Feature engineering', 'Encode categoricals, scale numerics and build a Pipeline.', 'A scikit-learn Pipeline.', 'Why put preprocessing inside the pipeline?', 40),
      s('Cross-validation and tuning', 'Use cross_val_score and GridSearchCV on one model.', 'Tuned model with CV score.', 'What is overfitting, in your own words?', 40),
      s('Evaluate properly', 'Plot a confusion matrix and ROC curve; pick a threshold for a stated goal.', 'Evaluation charts in the notebook.', 'Precision or recall: which matters for your problem?', 35),
      s('Explain and save the model', 'Show feature importances, save the model with joblib and write a model card.', 'model.joblib and a short model card.', 'Could someone reuse your model safely?', 35),
    ],
    capstone: 'train, evaluate and explain a model on the project dataset',
    checkpoint: 'Share a notebook with a baseline, a tuned model, a confusion matrix and a short model card.',
  },
  pandas: {
    steps: [
      s('Load and inspect', 'Load a CSV and use head, info, describe, value_counts and isna().sum().', 'A notebook section summarising the data.', 'Which columns have missing values?', 30),
      s('Select and filter', 'Practise loc/iloc, boolean masks and query().', '8 selection exercises.', 'loc vs iloc?', 35),
      s('Clean data', 'Fix types, handle missing values, strip strings and remove duplicates.', 'A clean DataFrame and a list of fixes.', 'Did you document every cleaning decision?', 40),
      s('Group and aggregate', 'Use groupby with agg, pivot_table and crosstab to answer 3 questions.', '3 answered questions.', 'How do you aggregate two columns differently?', 40),
      s('Merge and reshape', 'Merge two datasets and use melt/pivot.', 'A merged dataset.', 'What causes duplicated rows after a merge?', 35),
      s('Visualise findings', 'Create 3 clear charts with matplotlib/seaborn and write a short findings paragraph.', 'A mini report.', 'Does each chart answer one question?', 35),
    ],
    capstone: 'clean and analyse the project dataset with pandas',
    checkpoint: 'Publish a notebook that cleans a messy CSV and answers three questions with charts.',
  },
  'system-design': {
    steps: [
      s('Requirements and estimates', 'For a URL shortener, write functional/non-functional requirements and back-of-envelope traffic estimates.', 'A one-page requirements doc.', 'How many writes per second did you estimate?', 35),
      s('High-level design', 'Draw clients, load balancer, app servers, database and cache; justify each box.', 'A diagram with notes.', 'What is the single point of failure?', 40),
      s('Data model and storage', 'Choose SQL vs NoSQL and design the schema and key generation.', 'Schema + key strategy.', 'How do you avoid key collisions?', 35),
      s('Scaling reads and writes', 'Add caching, replication and sharding; note trade-offs.', 'Updated diagram with trade-offs.', 'What consistency do users see after a write?', 40),
      s('Reliability', 'Add rate limiting, monitoring and failure handling.', 'A reliability checklist.', 'What happens when the cache is down?', 35),
      s('Mock interview', 'Design “a placement notification system” in 35 minutes, out loud, and record it.', 'A recording and self-review.', 'Did you clarify requirements before drawing?', 45),
    ],
    capstone: 'write a design doc for the project covering scaling and failure cases',
    checkpoint: 'Record a 35-minute mock system design interview and write three things to improve.',
  },
  dsa: {
    steps: [
      s('Arrays and hashing', 'Solve 3 easy problems using hash maps (two sum, duplicates, anagram).', '3 solutions with complexity notes.', 'Can you state time and space complexity for each?', 40),
      s('Two pointers and sliding window', 'Solve 3 problems with two pointers/sliding window.', '3 solutions.', 'When does a sliding window apply?', 40),
      s('Stacks and queues', 'Solve valid parentheses, min stack and a queue using stacks.', '3 solutions.', 'Why is a stack natural for matching brackets?', 40),
      s('Linked lists and trees', 'Reverse a list, detect a cycle, and do BFS/DFS on a binary tree.', '4 solutions.', 'Recursive vs iterative traversal: trade-offs?', 45),
      s('Binary search and sorting', 'Solve 3 binary search variants and implement merge sort.', '4 solutions.', 'What invariant does your binary search keep?', 40),
      s('Timed practice', 'Do a 40-minute timed set of 2 mediums and review mistakes.', 'A mistakes log.', 'Which pattern did you miss?', 45),
    ],
    capstone: 'solve a timed problem set and log patterns',
    checkpoint: 'Complete a timed set of 2 medium problems and publish your solutions with complexity analysis.',
  },
};

// Skills that reuse a curated track under their own name.
const TRACK_ALIAS: Record<string, string> = {
  mysql: 'sql', postgresql: 'sql', sqlite: 'sql', 'oracle-db': 'sql', dbms: 'sql',
  express: 'nodejs', 'ci-cd': 'github-actions', 'gitlab-ci': 'github-actions', github: 'git', gitlab: 'git',
  'scikit-learn': 'machine-learning', numpy: 'pandas', bash: 'linux',
};

// Templates for every other skill, by category. {name} is replaced by the skill name.
const CATEGORY_TRACKS: Record<Category, Track> = {
  language: { steps: [
    s('Set up {name} and write first programs', 'Install the {name} toolchain, then solve 4 small exercises (strings, loops, functions) in the official tutorial or Exercism track.', 'A repo with 4 solved exercises.', 'Can you compile/run {name} code from the terminal?', 35),
    s('{name} data structures', 'Use the standard collections in {name} (lists/arrays, maps, sets) in 4 exercises.', '4 solutions.', 'Which collection gives O(1) lookups in {name}?', 40),
    s('{name} error handling and modules', 'Split code into modules/packages and handle errors the idiomatic {name} way.', 'A multi-file program.', 'How does {name} report errors?', 35),
    s('{name} idioms', 'Read 2 idiomatic {name} examples and refactor your earlier code to match.', 'A refactor diff.', 'Name 2 idioms you adopted.', 35),
    s('Test {name} code', 'Write unit tests with the standard {name} test tool.', 'Passing tests.', 'Can you run all tests with one command?', 35),
    s('Small {name} CLI', 'Build a small CLI tool in {name} that reads a file and prints a summary.', 'A working CLI with README.', 'Would it handle a missing file gracefully?', 45),
  ], capstone: 'write one component of the project in {name}', checkpoint: 'Publish a small {name} CLI tool with tests and a README.' },
  frontend: { steps: [
    s('Hello {name}', 'Follow the official {name} quick start and render a list of items from an array.', 'A running starter app.', 'Where does {name} keep component state?', 35),
    s('{name} components and data flow', 'Build 3 components that pass data down and events up.', 'A small interactive page.', 'How does data flow between components in {name}?', 40),
    s('Forms and validation in {name}', 'Build a validated form with error messages.', 'A working form.', 'Is your form usable with the keyboard only?', 35),
    s('Fetch data in {name}', 'Load data from an API with loading and error states.', 'A data-driven page.', 'What does the user see while loading?', 35),
    s('Routing and structure', 'Add 2 routes/pages and organise folders the {name} way.', 'Multi-page app.', 'Can you explain your folder structure?', 35),
    s('Test and deploy {name}', 'Add one component test and deploy to Netlify or Vercel.', 'Live URL.', 'Does the deployed app work on your phone?', 40),
  ], capstone: 'build the user interface with {name}', checkpoint: 'Deploy a small {name} app with two pages and a validated form.' },
  backend: { steps: [
    s('Hello {name}', 'Follow the {name} quick start and create one GET endpoint.', 'A running server.', 'How does {name} map a URL to code?', 35),
    s('CRUD with {name}', 'Add create/read/update/delete endpoints for one resource.', 'Working CRUD routes.', 'Do you return correct status codes?', 45),
    s('Validation and errors in {name}', 'Add input validation and a consistent error format.', 'Validated routes.', 'What happens on bad input?', 35),
    s('Database integration', 'Connect {name} to a database and persist the resource.', 'Persistent data.', 'Where are your queries defined?', 40),
    s('Config and auth', 'Read settings from env vars and protect write routes.', 'Protected routes.', 'Are secrets kept out of git?', 35),
    s('Test {name} endpoints', 'Write API tests for success and failure cases.', 'Passing API tests.', 'Does each route have a failure test?', 40),
  ], capstone: 'build the backend with {name}', checkpoint: 'Publish a {name} API with CRUD, validation and tests.' },
  mobile: { steps: [
    s('{name} setup', 'Install the {name} toolchain and run the starter app on an emulator or your phone.', 'Running starter app.', 'Can you hot-reload a change?', 40),
    s('Layouts and lists', 'Build a scrollable list screen with item cards.', 'A list screen.', 'How does the list stay smooth with 500 items?', 40),
    s('Navigation', 'Add a detail screen and navigate with parameters.', 'Two connected screens.', 'How is the back stack handled?', 35),
    s('State and data', 'Load data from a JSON API and keep simple state.', 'Data-driven screen.', 'What happens offline?', 40),
    s('Local storage', 'Persist favourites locally.', 'Favourites survive restart.', 'Where is the data stored?', 35),
    s('Build and share', 'Produce a debug build/APK and record a demo.', 'Installable build + demo video.', 'Does it run on a real device?', 35),
  ], capstone: 'build the mobile client with {name}', checkpoint: 'Share an installable {name} build with two screens and offline favourites.' },
  database: { steps: [
    s('Run {name} locally', 'Start {name} (Docker or managed free tier) and connect with its CLI or GUI.', 'A running instance.', 'How do you connect from the terminal?', 30),
    s('Model data in {name}', 'Design storage for students, companies and applications in {name}.', 'A schema/design note.', 'Why did you choose this structure?', 35),
    s('Queries in {name}', 'Write 8 queries covering filters, sorting and aggregation.', 'queries file with results.', 'Which query was hardest and why?', 40),
    s('Indexes and performance', 'Load test data, add an index and measure the difference.', 'Before/after timings.', 'How do you know the index is used?', 40),
    s('Use {name} from code', 'Connect from your app and implement CRUD.', 'Data access module.', 'Where is the connection string kept?', 40),
    s('Backup and restore', 'Back up and restore your {name} data.', 'A backup/restore script.', 'Could you recover from deleting the data?', 30),
  ], capstone: 'store the project data in {name}', checkpoint: 'Show a {name}-backed app with indexed queries and a backup script.' },
  cloud: { steps: [
    s('{name} account safety', 'Create a free-tier account, enable MFA and set a budget alert.', 'Secured account + budget alert.', 'Will you be warned before spending money?', 30),
    s('Core {name} services', 'Identify the {name} equivalents of compute, storage and database; try the storage service.', 'A mapping table + uploaded file.', 'Which service would host a static site?', 35),
    s('Deploy compute on {name}', 'Deploy a small app on {name} compute (VM, app service or function).', 'A live endpoint.', 'How is traffic allowed in?', 45),
    s('Identity and access on {name}', 'Create a least-privilege role/identity for your app.', 'A policy/role definition.', 'What can this identity NOT do?', 35),
    s('Monitor on {name}', 'View logs and metrics for your deployment and create one alert.', 'An alert configured.', 'Where would you look first when it breaks?', 35),
    s('Clean up {name}', 'Delete resources and confirm $0 spend; write a summary.', 'Summary note.', 'Is anything still running?', 30),
  ], capstone: 'deploy the project to {name}', checkpoint: 'Show a small app deployed on {name} with an alert, then cleaned up at $0 spend.' },
  devops: { steps: [
    s('Install and explore {name}', 'Install {name} and follow its getting-started guide on a practice project.', 'A working first setup.', 'What problem does {name} solve?', 35),
    s('Core {name} concepts', 'Write down the 5 core concepts of {name} and apply each once.', 'Notes + config/code using them.', 'Can you explain each concept in one sentence?', 40),
    s('{name} on a real project', 'Apply {name} to one of your existing projects.', 'A commit adding {name}.', 'Does it work from a clean clone?', 45),
    s('Configuration and secrets', 'Move settings into variables/secrets the {name} way.', 'Parameterised config.', 'Are secrets out of the repo?', 35),
    s('Break and fix {name}', 'Introduce a misconfiguration and debug it from logs.', 'A troubleshooting checklist.', 'How did you find the cause?', 30),
    s('Document {name} usage', 'Write a README section on how the team uses {name}.', 'README section.', 'Could a teammate use it without asking you?', 30),
  ], capstone: 'set up {name} for the project', checkpoint: 'Demonstrate {name} on one of your projects, including a documented fix for a misconfiguration.' },
  ci: { steps: [
    s('First {name} pipeline', 'Create a pipeline in {name} that runs on push and prints environment info.', 'A green pipeline run.', 'What triggers the pipeline?', 35),
    s('Run tests in {name}', 'Install dependencies and run tests; make one fail on purpose.', 'A failing then passing run.', 'Does a failing test stop the pipeline?', 40),
    s('Caching and speed', 'Add dependency caching and measure the time saved.', 'Timings in notes.', 'What is cached, and when is it invalidated?', 35),
    s('Secrets in {name}', 'Use a masked secret in a step.', 'A step using a secret safely.', 'Is the value hidden in logs?', 30),
    s('Build stage', 'Add a build stage that depends on tests and publishes an artifact.', 'Two-stage pipeline.', 'Does build skip on failed tests?', 40),
    s('Merge checks', 'Require the pipeline to pass before merging.', 'Protected branch.', 'Why block merges on failures?', 30),
  ], capstone: 'add a {name} pipeline that tests and builds the project', checkpoint: 'Show a {name} pipeline with tests, caching and a build stage blocking merges on failure.' },
  testing: { steps: [
    s('First {name} tests', 'Set up {name} in a practice project and write 3 tests for pure functions.', 'Passing tests.', 'What does a good test name say?', 35),
    s('Arrange, act, assert', 'Refactor tests into clear AAA structure and test edge cases.', '5 edge-case tests.', 'Which edge case surprised you?', 35),
    s('Mocks and fakes', 'Mock a network or database call in {name}.', 'A test using a mock.', 'When is mocking harmful?', 40),
    s('Testing UI or APIs', 'Use {name} to test a component or endpoint end to end.', 'An integration test.', 'Does it test behaviour users care about?', 40),
    s('Coverage', 'Run coverage, find an untested branch and cover it.', 'Coverage report.', 'Is 100% coverage the goal?', 30),
    s('Tests in CI', 'Run {name} in CI on every push.', 'CI run with tests.', 'Do failures block merges?', 30),
  ], capstone: 'cover the project with {name} tests', checkpoint: 'Show a project with {name} unit and integration tests running in CI.' },
  data: { steps: [
    s('Get started with {name}', 'Install or open {name} and load a public dataset (e.g. placement or job postings data).', 'Dataset loaded.', 'What does each column mean?', 35),
    s('Clean the data in {name}', 'Handle missing values, types and duplicates.', 'Clean dataset + list of fixes.', 'Did you record each cleaning step?', 40),
    s('Summarise with {name}', 'Answer 3 questions with grouping/aggregation.', '3 answered questions.', 'Are the numbers plausible?', 40),
    s('Visualise in {name}', 'Create 3 charts that each answer one question.', '3 charts.', 'Would a reader get the point in 5 seconds?', 35),
    s('Build a small report', 'Combine charts and findings into a one-page report or dashboard.', 'Report/dashboard.', 'Does it state the takeaway first?', 40),
    s('Share and explain', 'Publish the report and write a 5-line method note.', 'Shared link + method note.', 'Could someone reproduce your numbers?', 30),
  ], capstone: 'analyse the project dataset with {name}', checkpoint: 'Publish a one-page {name} analysis of a public dataset with three charts.' },
  ml: { steps: [
    s('{name} fundamentals', 'Work through the official {name} beginner tutorial end to end.', 'A completed tutorial notebook.', 'What problem does {name} solve?', 45),
    s('Your own data', 'Apply {name} to a small dataset of your choice and set a baseline.', 'Baseline result.', 'How will you judge success?', 40),
    s('Improve the model', 'Change one thing at a time (features, architecture, parameters) and log results.', 'Experiment log.', 'Which change helped most?', 40),
    s('Evaluate honestly', 'Evaluate on a held-out set with the right metric.', 'Evaluation section.', 'Could your result be data leakage?', 35),
    s('Package the model', 'Save the model and write an inference function.', 'Inference script.', 'Does it run on new input?', 35),
    s('Document', 'Write a model card covering data, metrics and limitations.', 'Model card.', 'What should users not use it for?', 30),
  ], capstone: 'build the model component with {name}', checkpoint: 'Share a notebook applying {name} to your own data with a baseline, evaluation and model card.' },
  tool: { steps: [
    s('Learn {name} basics', 'Follow the {name} getting-started guide on a practice project.', 'Practice project.', 'What is {name} for?', 30),
    s('Daily workflow with {name}', 'Use {name} for a real task and note the 5 actions you used most.', 'Workflow notes.', 'Which shortcut saves the most time?', 35),
    s('{name} in a team', 'Set up {name} the way a team would share it.', 'Shared setup.', 'Would a teammate understand your setup?', 35),
    s('Advanced {name} feature', 'Try one advanced feature and write when to use it.', 'Short note + example.', 'When is it overkill?', 35),
    s('Troubleshoot {name}', 'Reproduce and fix a common {name} problem.', 'Fix notes.', 'How did you find the fix?', 30),
    s('Show {name} usage', 'Write a short guide for your team.', 'Guide.', 'Is it under one page?', 30),
  ], capstone: 'use {name} throughout the project', checkpoint: 'Show a practice project where {name} is set up the way a team would use it.' },
  concept: { steps: [
    s('Understand {name}', 'Read one solid introduction to {name} and write a one-page summary in your own words.', 'One-page summary.', 'Could you explain {name} to a first-year?', 35),
    s('{name} by example', 'Find 2 real examples of {name} in open-source code or blog posts and annotate them.', 'Annotated examples.', 'What problem did {name} solve there?', 35),
    s('Apply {name}', 'Apply {name} to a small piece of your own project.', 'A commit applying it.', 'What changed because of it?', 45),
    s('Common mistakes', 'List 5 common mistakes with {name} and check your work against them.', 'Checklist.', 'Did you find one in your own code?', 30),
    s('Practise questions', 'Answer 5 interview questions on {name} out loud and write short answers.', 'Q&A notes.', 'Which question was hardest?', 35),
    s('Teach it', 'Write a short blog post or README section explaining {name} with your example.', 'Published write-up.', 'Would a reader be able to apply it?', 40),
  ], capstone: 'apply {name} in the project and explain it in the README', checkpoint: 'Publish a short write-up applying {name} to your own code, with the example linked.' },
  design: { steps: [
    s('{name} basics', 'Complete the official {name} beginner tutorial.', 'Tutorial file.', 'Can you create frames and components?', 35),
    s('Recreate a screen', 'Recreate one screen from an app you use.', 'Recreated screen.', 'Is spacing consistent?', 40),
    s('Components and styles', 'Make reusable components and text/colour styles.', 'Mini design system.', 'Can you change a colour everywhere at once?', 35),
    s('Auto layout and responsiveness', 'Build a responsive card list.', 'Responsive layout.', 'Does it adapt from mobile to desktop?', 35),
    s('Prototype', 'Link screens into a clickable prototype.', 'Prototype link.', 'Can someone complete the task without help?', 35),
    s('Hand-off', 'Prepare the file for developers with notes and specs.', 'Hand-off-ready file.', 'Could a developer build it from this?', 30),
  ], capstone: 'design the project screens in {name}', checkpoint: 'Share a {name} prototype of two screens with reusable components.' },
};

const EXTENSION: Step[] = [
  s('Rebuild from memory: {name}', 'Without notes, rebuild the core of what you did on the earlier {name} days, then compare with your notes.', 'A from-memory version and a list of gaps.', 'What did you have to look up?', 40),
  s('Explain {name} out loud', 'Answer 5 interview-style questions about {name} out loud and record yourself.', 'Recording + written answers.', 'Which answer would you improve?', 35),
  s('Edge cases in {name}', 'Find 3 things that break your {name} work (bad input, missing config, scale) and fix them.', '3 fixes with notes.', 'Which failure would a user hit first?', 40),
];

const PREREQ: Record<string, string[]> = {
  kubernetes: ['docker'], nextjs: ['react'], 'spring-boot': ['java'], express: ['nodejs'],
  react: ['javascript'], typescript: ['javascript'], 'github-actions': ['git'], django: ['python'],
  flask: ['python'], fastapi: ['python'], pandas: ['python'], 'machine-learning': ['python', 'pandas'],
  'react-native': ['react'], redux: ['react'],
};

type Family = 'web' | 'data' | 'mobile' | 'any' | 'standalone';
function familyOf(id: string): Family {
  if (['dsa', 'system-design', 'operating-systems', 'computer-networks', 'agile'].includes(id)) return 'standalone';
  const c = SKILL_BY_ID[id]?.category;
  if (id === 'python' || id === 'sql' || c === 'language' || c === 'tool') return 'any';
  if (c === 'data' || c === 'ml' || id === 'statistics' || id === 'etl') return 'data';
  if (c === 'mobile') return 'mobile';
  return 'web';
}

const PROJECT: Record<'web' | 'data' | 'mobile', string> = {
  web: 'Placement Tracker: a small web service where students log applications',
  data: 'Placement Insights: analyse a public campus placement dataset',
  mobile: 'Interview Prep: a two-screen mobile app with saved questions',
};

const fill = (t: string, name: string) => t.replaceAll('{name}', name);

function trackFor(id: string): Track {
  const t = TRACKS[id] ?? TRACKS[TRACK_ALIAS[id]];
  if (t) return t;
  return CATEGORY_TRACKS[SKILL_BY_ID[id]?.category ?? 'concept'];
}

export function buildPlan(topGaps: ResultItem[]): Plan {
  const gaps = topGaps.slice(0, 3).map((g) => ({ key: g.key, skillId: g.skillIds[0], name: SKILL_BY_ID[g.skillIds[0]]?.name ?? g.skillIds[0], label: g.label, days: [] as number[] }));
  if (!gaps.length) return { days: [], gaps: [], mode: 'none', totalMinutes: 0 };

  // Order by dependencies (a prerequisite that is also a gap goes first), then by gap rank.
  const order: typeof gaps = [];
  const visit = (g: (typeof gaps)[number], stack: Set<string>) => {
    if (order.includes(g) || stack.has(g.skillId)) return;
    stack.add(g.skillId);
    for (const pre of PREREQ[g.skillId] ?? []) {
      const pg = gaps.find((x) => x.skillId === pre);
      if (pg) visit(pg, stack);
    }
    order.push(g);
  };
  gaps.forEach((g) => visit(g, new Set()));

  const k = order.length;
  const capDays = k === 1 ? 5 : 3;
  const learnDays = 14 - capDays;
  const split = k === 1 ? [learnDays] : k === 2 ? [6, 5] : [4, 4, 3];
  const families = order.map((g) => familyOf(g.skillId));
  const concrete = families.filter((f) => f !== 'any');
  const oneProject = !concrete.includes('standalone') && new Set(concrete).size <= 1;
  const family = (concrete[0] ?? 'web') as 'web' | 'data' | 'mobile';

  const days: PlanDay[] = [];
  let d = 1;
  const lastDay: Record<string, number> = {};
  order.forEach((g, gi) => {
    const t = trackFor(g.skillId);
    const steps = [...t.steps, ...EXTENSION];
    for (let i = 0; i < split[gi]; i++) {
      const st = steps[i];
      const deps = i > 0 ? [d - 1] : (PREREQ[g.skillId] ?? []).map((p) => lastDay[p]).filter(Boolean);
      days.push({
        day: d, gapKeys: [g.key], skillIds: [g.skillId], kind: 'learn',
        title: fill(st.title, g.name), task: fill(st.task, g.name), output: fill(st.output, g.name), selfCheck: fill(st.check, g.name),
        minutes: st.min, dependsOn: deps,
      });
      g.days.push(d);
      d++;
    }
    lastDay[g.skillId] = d - 1;
  });

  const allKeys = order.map((g) => g.key);
  const allIds = order.map((g) => g.skillId);
  const learnEnds = order.map((g) => lastDay[g.skillId]);
  const contributions = order.map((g) => fill(trackFor(g.skillId).capstone, g.name));
  const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join('; ')}; and ${xs[xs.length - 1]}`);

  if (oneProject) {
    const title = PROJECT[family];
    const names = order.map((g) => g.name).join(' + ');
    const capPlan: [string, string, string, string, number][] = k === 1
      ? [
          ['Project: plan and set up', `Start “${title}”. Write a 5-line scope, create the repo and the skeleton you need to ${contributions[0]}.`, 'Repo with README scope and skeleton.', 'Is the scope small enough to finish in 4 more sessions?', 35],
          ['Project: core build', `Build the first half: ${contributions[0]}.`, 'A working first version.', 'Does it run from a clean clone?', 45],
          ['Project: finish the feature', `Finish the remaining parts of the ${order[0].name} work and handle one error case.`, 'Feature complete.', 'What happens on bad input?', 45],
          ['Project: test and polish', 'Add tests or checks, fix rough edges and update the README with setup steps.', 'Tests + README.', 'Could a judge run it in 5 minutes?', 40],
          ['Demo and resume evidence', 'Record a 2-minute demo, push everything, and write one resume bullet with a link that shows the skill in use.', 'Demo video + resume bullet.', 'Does the bullet name the skill and a result?', 35],
        ]
      : [
          ['Project: set up and first piece', `Start “${title}”. Scope it in 5 lines, then ${contributions[0]}.`, 'Repo with README scope and the first piece working.', 'Is the scope small enough for 3 sessions?', 45],
          [`Project: add ${order.slice(1).map((g) => g.name).join(' + ')}`, `Now ${joinList(contributions.slice(1))}. Make the parts work together end to end.`, 'All parts integrated.', `Do ${names} work together from a clean clone?`, 45],
          ['Demo and resume evidence', 'Record a 2-minute demo, update the README, and write one resume bullet per skill linking to the repo.', `Demo video + ${k} resume bullets.`, 'Does each bullet show evidence, not just a keyword?', 40],
        ];
    capPlan.forEach(([title2, task, output, check, min], i) => {
      days.push({ day: d, gapKeys: allKeys, skillIds: allIds, kind: 'project', title: title2, task, output, selfCheck: check, minutes: min, dependsOn: i === 0 ? learnEnds : [d - 1] });
      d++;
    });
    order.forEach((g) => g.days.push(...days.filter((x) => x.kind === 'project').map((x) => x.day)));
    return finish(days, gaps, 'project', title);
  }

  // Skills that don't share a natural project get separate practical checkpoints.
  order.forEach((g) => {
    const t = trackFor(g.skillId);
    days.push({ day: d, gapKeys: [g.key], skillIds: [g.skillId], kind: 'checkpoint', title: `Checkpoint: ${g.name}`, task: fill(t.checkpoint, g.name), output: `Evidence for ${g.name} you can link from your resume.`, selfCheck: `Would a recruiter see real ${g.name} use, not just the keyword?`, minutes: 45, dependsOn: [lastDay[g.skillId]] });
    g.days.push(d);
    d++;
  });
  while (d <= 14) {
    days.push({ day: d, gapKeys: allKeys, skillIds: allIds, kind: 'checkpoint', title: 'Resume evidence', task: 'Write one resume bullet per checkpoint with a link (repo, notebook or video), then re-run this analysis with the updated resume.', output: 'Updated resume with linked evidence.', selfCheck: 'Does the analysis now find evidence for these skills?', minutes: 30, dependsOn: days.filter((x) => x.kind === 'checkpoint').map((x) => x.day) });
    order.forEach((g) => g.days.push(d));
    d++;
  }
  return finish(days, gaps, 'checkpoints');
}

function finish(days: PlanDay[], gaps: Plan['gaps'], mode: Plan['mode'], projectTitle?: string): Plan {
  return { days, gaps, mode, projectTitle, totalMinutes: days.reduce((a, x) => a + x.minutes, 0) };
}
