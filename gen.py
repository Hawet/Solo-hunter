import os

# Define project structure
project_structure = {
    "eve-solo-pvp-finder": {
        "backend": {
            "app": {
                "api": {"routes.py": ""},
                "db": {
                    "models.py": "",
                    "database.py": ""
                },
                "main.py": "",
                "websocket_consumer.py": ""
            },
            "Dockerfile": """\
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
""",
            "requirements.txt": "fastapi\nuvicorn[standard]\nsqlalchemy\nasyncpg\nwebsockets\n"
        },
        "frontend": {
            "public": {},
            "src": {},
            "Dockerfile": """\
FROM node:18

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "preview"]
""",
            "package.json": """\
{
  "name": "eve-solo-pvp-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "svelte": "^3.0.0"
  },
  "devDependencies": {
    "vite": "^4.0.0"
  }
}
"""
        },
        "terraform": {
            "main.tf": "",
            "variables.tf": 'variable "aws_region" { default = "us-east-1" }\n',
            "outputs.tf": "",
            "ec2.tf": "",
            "rds.tf": "",
            "s3.tf": ""
        },
        "README.md": "# EVE Solo PvP Finder\n\nA web app to find solo PvP fights in EVE Online.",
        "docker-compose.yml": """\
version: '3.9'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/evepvp
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"

  db:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: evepvp
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data

volumes:
  db_data:
"""
    }
}

def create_structure(base_path, structure):
    for name, content in structure.items():
        path = os.path.join(base_path, name)
        if isinstance(content, dict):
            os.makedirs(path, exist_ok=True)
            create_structure(path, content)
        else:
            with open(path, "w") as f:
                f.write(content)

if __name__ == "__main__":
    create_structure(".", project_structure)
    print("✅ Project structure created successfully.")
