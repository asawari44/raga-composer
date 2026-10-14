.PHONY: help install run test format check site serve-site docker

help:  ## Show available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

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

site:  ## Build the static site in site/
	uv run python scripts/build_site.py

serve-site: site  ## Serve site/ under the GitHub Pages project path for local preview
	rm -rf .site-preview
	mkdir -p .site-preview
	PREVIEW_PATH=$$(uv run python -c 'from scripts.build_site import SITE_PATH; print(SITE_PATH.strip("/"))'); \
	ln -s ../site ".site-preview/$$PREVIEW_PATH"; \
	uv run python -m http.server 8000 --directory .site-preview

docker:  ## Build the container image
	docker build -t raga-composer .
