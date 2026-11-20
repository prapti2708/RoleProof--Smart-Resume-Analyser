// Versioned skill dictionary. Bump SKILL_DICTIONARY_VERSION whenever entries or aliases change,
// so evaluation results can be traced to the dictionary that produced them.
//
// Alias rules (see README "Matching rules"):
// - An alias is split into parts on spaces, dots, hyphens and underscores. Between parts the matcher
//   accepts one optional separator, so "react.js" matches ReactJS, React.js, react js and React-JS.
// - Symbols that carry meaning (+, #) are kept literally: C, C++ and C# never match each other.
// - Word boundaries forbid a letter, digit, + or # right after an alias, so Java never matches JavaScript.
// - `cs` (case-sensitive) is used for skills whose names are ordinary English words (React, Go, Swift).
// - `ambiguous` marks names that are risky outside a list of skills; such JD hits go to "Needs review"
//   unless they sit in a comma/slash separated list next to other skills.
// - Related skills stay distinct (React ≠ React Native, Java ≠ JavaScript, GitHub ≠ GitHub Actions).
//   The only equivalences are the aliases listed here.

export const SKILL_DICTIONARY_VERSION = '2026.11.1';

export type Category =
  | 'language' | 'frontend' | 'backend' | 'mobile' | 'database' | 'cloud' | 'devops' | 'ci'
  | 'testing' | 'data' | 'ml' | 'tool' | 'concept' | 'design';

export interface SkillDef {
  id: string;
  name: string;
  category: Category;
  aliases: string[];
  /** Case-sensitive aliases (matched exactly as written). */
  cs?: string[];
  ambiguous?: boolean;
}

type Row = [id: string, name: string, category: Category, aliases: string[], cs?: string[], ambiguous?: boolean];

const ROWS: Row[] = [
  // Languages
  ['python', 'Python', 'language', ['python', 'python3', 'python 3']],
  ['java', 'Java', 'language', ['java', 'core java', 'java 8', 'java 11', 'java 17']],
  ['javascript', 'JavaScript', 'language', ['javascript', 'java script', 'ecmascript', 'es6', 'vanilla js'], ['JS']],
  ['typescript', 'TypeScript', 'language', ['typescript'], ['TS']],
  ['c', 'C', 'language', [], ['C'], true],
  ['cpp', 'C++', 'language', ['c++', 'cpp'], ['CPP']],
  ['csharp', 'C#', 'language', ['c#', 'csharp', 'c sharp']],
  ['go', 'Go', 'language', ['golang'], ['Go'], true],
  ['rust', 'Rust', 'language', [], ['Rust']],
  ['kotlin', 'Kotlin', 'language', ['kotlin']],
  ['swift', 'Swift', 'language', [], ['Swift']],
  ['php', 'PHP', 'language', ['php']],
  ['ruby', 'Ruby', 'language', [], ['Ruby']],
  ['scala', 'Scala', 'language', ['scala']],
  ['r', 'R', 'language', [], ['R'], true],
  ['dart', 'Dart', 'language', [], ['Dart']],
  ['sql', 'SQL', 'language', ['sql']],
  ['bash', 'Bash / Shell scripting', 'language', ['bash', 'shell scripting', 'shell script', 'shell scripts']],
  ['html', 'HTML', 'frontend', ['html', 'html5']],
  ['css', 'CSS', 'frontend', ['css', 'css3']],
  ['matlab', 'MATLAB', 'language', ['matlab']],

  // Frontend
  ['react', 'React', 'frontend', ['react.js', 'reactjs'], ['React', 'REACT']],
  ['react-native', 'React Native', 'mobile', ['react native']],
  ['vue', 'Vue', 'frontend', ['vue', 'vue.js', 'vuejs', 'vue 3']],
  ['angular', 'Angular', 'frontend', ['angular', 'angularjs', 'angular.js']],
  ['svelte', 'Svelte', 'frontend', ['svelte', 'sveltekit']],
  ['nextjs', 'Next.js', 'frontend', ['next.js', 'nextjs']],
  ['redux', 'Redux', 'frontend', ['redux', 'redux toolkit']],
  ['tailwind', 'Tailwind CSS', 'frontend', ['tailwind', 'tailwind css', 'tailwindcss']],
  ['bootstrap', 'Bootstrap', 'frontend', ['bootstrap']],
  ['jquery', 'jQuery', 'frontend', ['jquery']],
  ['sass', 'Sass', 'frontend', ['sass', 'scss']],
  ['webpack', 'Webpack', 'frontend', ['webpack']],
  ['figma', 'Figma', 'design', ['figma']],

  // Backend
  ['nodejs', 'Node.js', 'backend', ['node.js', 'nodejs']],
  ['express', 'Express', 'backend', ['express.js', 'expressjs'], ['Express']],
  ['django', 'Django', 'backend', ['django']],
  ['flask', 'Flask', 'backend', ['flask']],
  ['fastapi', 'FastAPI', 'backend', ['fastapi', 'fast api']],
  ['spring-boot', 'Spring Boot', 'backend', ['spring boot', 'springboot']],
  ['spring', 'Spring Framework', 'backend', ['spring framework', 'spring mvc'], ['Spring']],
  ['dotnet', '.NET', 'backend', ['.net', 'dotnet', '.net core', 'asp.net', 'asp.net core']],
  ['laravel', 'Laravel', 'backend', ['laravel']],
  ['rails', 'Ruby on Rails', 'backend', ['ruby on rails'], ['Rails', 'RoR']],
  ['graphql', 'GraphQL', 'backend', ['graphql']],
  ['rest-api', 'REST APIs', 'concept', ['rest api', 'rest apis', 'restful', 'restful api', 'restful apis', 'restful services', 'rest services'], ['REST']],
  ['grpc', 'gRPC', 'backend', ['grpc']],
  ['microservices', 'Microservices', 'concept', ['microservices', 'microservice', 'micro services', 'microservice architecture']],
  ['kafka', 'Apache Kafka', 'backend', ['kafka', 'apache kafka']],
  ['rabbitmq', 'RabbitMQ', 'backend', ['rabbitmq', 'rabbit mq']],

  // Mobile
  ['android', 'Android development', 'mobile', ['android', 'android sdk', 'android studio']],
  ['ios', 'iOS development', 'mobile', ['ios development', 'ios sdk'], ['iOS']],
  ['flutter', 'Flutter', 'mobile', ['flutter']],
  ['jetpack-compose', 'Jetpack Compose', 'mobile', ['jetpack compose']],

  // Databases
  ['mysql', 'MySQL', 'database', ['mysql']],
  ['postgresql', 'PostgreSQL', 'database', ['postgresql', 'postgres', 'postgre sql', 'psql']],
  ['mongodb', 'MongoDB', 'database', ['mongodb', 'mongo db', 'mongo']],
  ['redis', 'Redis', 'database', ['redis']],
  ['sqlite', 'SQLite', 'database', ['sqlite']],
  ['oracle-db', 'Oracle Database', 'database', ['oracle database', 'oracle db', 'pl/sql', 'plsql']],
  ['firebase', 'Firebase', 'database', ['firebase', 'firestore']],
  ['dynamodb', 'DynamoDB', 'database', ['dynamodb', 'dynamo db']],
  ['elasticsearch', 'Elasticsearch', 'database', ['elasticsearch', 'elastic search']],
  ['cassandra', 'Cassandra', 'database', ['cassandra']],
  ['nosql', 'NoSQL', 'concept', ['nosql']],
  ['dbms', 'Database design', 'concept', ['dbms', 'database design', 'data modeling', 'data modelling', 'database management']],

  // Cloud
  ['aws', 'AWS', 'cloud', ['aws', 'amazon web services']],
  ['azure', 'Microsoft Azure', 'cloud', ['azure', 'microsoft azure']],
  ['gcp', 'Google Cloud', 'cloud', ['gcp', 'google cloud', 'google cloud platform']],
  ['aws-lambda', 'AWS Lambda', 'cloud', ['aws lambda', 'lambda functions']],
  ['ec2', 'AWS EC2', 'cloud', ['ec2', 'aws ec2']],
  ['s3', 'AWS S3', 'cloud', ['aws s3', 'amazon s3'], ['S3']],
  ['serverless', 'Serverless', 'concept', ['serverless']],
  ['vercel', 'Vercel', 'cloud', ['vercel']],
  ['heroku', 'Heroku', 'cloud', ['heroku']],

  // DevOps & CI
  ['docker', 'Docker', 'devops', ['docker', 'dockerfile', 'dockerfiles', 'docker compose', 'docker-compose', 'containerization', 'containerisation']],
  ['kubernetes', 'Kubernetes', 'devops', ['kubernetes', 'k8s', 'kubectl']],
  ['terraform', 'Terraform', 'devops', ['terraform']],
  ['ansible', 'Ansible', 'devops', ['ansible']],
  ['linux', 'Linux', 'devops', ['linux', 'ubuntu', 'unix']],
  ['nginx', 'Nginx', 'devops', ['nginx']],
  ['git', 'Git', 'tool', ['git', 'version control', 'source control']],
  ['github', 'GitHub', 'tool', ['github']],
  ['gitlab', 'GitLab', 'tool', ['gitlab']],
  ['github-actions', 'GitHub Actions', 'ci', ['github actions', 'gh actions', 'github workflows']],
  ['gitlab-ci', 'GitLab CI', 'ci', ['gitlab ci', 'gitlab ci/cd', 'gitlab pipelines']],
  ['jenkins', 'Jenkins', 'ci', ['jenkins']],
  ['ci-cd', 'CI/CD', 'concept', ['ci/cd', 'ci cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment']],
  ['prometheus', 'Prometheus', 'devops', ['prometheus']],
  ['grafana', 'Grafana', 'devops', ['grafana']],

  // Testing
  ['jest', 'Jest', 'testing', [], ['Jest', 'jest']],
  ['pytest', 'pytest', 'testing', ['pytest']],
  ['junit', 'JUnit', 'testing', ['junit']],
  ['selenium', 'Selenium', 'testing', ['selenium']],
  ['cypress', 'Cypress', 'testing', ['cypress']],
  ['playwright', 'Playwright', 'testing', ['playwright']],
  ['unit-testing', 'Unit testing', 'concept', ['unit testing', 'unit tests', 'unit test', 'test driven development', 'tdd']],
  ['postman', 'Postman', 'tool', ['postman']],

  // Data & ML
  ['pandas', 'pandas', 'data', ['pandas']],
  ['numpy', 'NumPy', 'data', ['numpy']],
  ['matplotlib', 'Matplotlib', 'data', ['matplotlib', 'seaborn']],
  ['excel', 'Excel', 'data', ['ms excel', 'microsoft excel', 'advanced excel'], ['Excel']],
  ['power-bi', 'Power BI', 'data', ['power bi', 'powerbi']],
  ['tableau', 'Tableau', 'data', ['tableau']],
  ['spark', 'Apache Spark', 'data', ['apache spark', 'pyspark'], ['Spark']],
  ['hadoop', 'Hadoop', 'data', ['hadoop']],
  ['airflow', 'Apache Airflow', 'data', ['airflow', 'apache airflow']],
  ['etl', 'ETL pipelines', 'concept', ['etl', 'elt', 'data pipelines', 'data pipeline']],
  ['statistics', 'Statistics', 'concept', ['statistics', 'statistical analysis', 'hypothesis testing']],
  ['machine-learning', 'Machine learning', 'ml', ['machine learning', 'ml models', 'ml model']],
  ['deep-learning', 'Deep learning', 'ml', ['deep learning', 'neural networks', 'neural network']],
  ['nlp', 'NLP', 'ml', ['nlp', 'natural language processing']],
  ['computer-vision', 'Computer vision', 'ml', ['computer vision', 'opencv']],
  ['scikit-learn', 'scikit-learn', 'ml', ['scikit-learn', 'scikit learn', 'sklearn']],
  ['tensorflow', 'TensorFlow', 'ml', ['tensorflow', 'keras']],
  ['pytorch', 'PyTorch', 'ml', ['pytorch', 'torch']],
  ['llm', 'LLMs', 'ml', ['llm', 'llms', 'large language models', 'large language model', 'generative ai', 'genai', 'prompt engineering']],
  ['huggingface', 'Hugging Face', 'ml', ['hugging face', 'huggingface', 'transformers library']],

  // Concepts & CS fundamentals
  ['dsa', 'Data structures & algorithms', 'concept', ['data structures', 'dsa', 'data structures and algorithms', 'data structures & algorithms']],
  ['oop', 'Object-oriented programming', 'concept', ['oop', 'oops', 'object oriented programming', 'object-oriented programming', 'object oriented design']],
  ['system-design', 'System design', 'concept', ['system design', 'low level design', 'high level design', 'lld', 'hld']],
  ['operating-systems', 'Operating systems', 'concept', ['operating systems', 'operating system']],
  ['computer-networks', 'Computer networks', 'concept', ['computer networks', 'computer networking', 'tcp/ip', 'networking fundamentals']],
  ['agile', 'Agile / Scrum', 'concept', ['agile', 'scrum', 'kanban', 'jira']],
  ['web-security', 'Web security', 'concept', ['web security', 'owasp', 'application security', 'oauth', 'jwt']],
  ['responsive-design', 'Responsive design', 'concept', ['responsive design', 'responsive web design', 'mobile-first']],
  ['accessibility', 'Web accessibility', 'concept', ['web accessibility', 'accessibility', 'wcag', 'a11y']],
];

export const SKILLS: SkillDef[] = ROWS.map(([id, name, category, aliases, cs, ambiguous]) => ({
  id, name, category, aliases, cs, ambiguous,
}));

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
