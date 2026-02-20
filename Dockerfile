# Use official Python image
FROM python:3.13-slim

# Install uv
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy dependency files first (allows Docker to cache this layer)
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen

# Copy the rest of the app
COPY . .

# Expose the port FastAPI runs on
EXPOSE 8000

# Start the app
CMD ["uv", "run", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]