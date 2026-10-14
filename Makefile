.PHONY: help install run test format check docker

help:  ## Show available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

install:  ## Install dependencies
	uv sync

run:  ## Run the dev server with reload (PORT defaults to 8000)
	RELOAD=1 uv run raga-composer

test:  ## Run tests
	uv run pytest -q

format:  ## Format and autofix lint issues
	uv run ruff format . && uv run ruff check --fix .

check:  ## Lint and type-check
	uv run ruff check . && uv run mypy

docker:  ## Build the container image
	docker build -t raga-composer .
