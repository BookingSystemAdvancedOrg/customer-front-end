# site-builder-render Lambda image (ADR-B 3). Built from the REPO ROOT:
#   docker build -f render-lambda/Dockerfile -t site-builder-render:latest .
# Stage 1 builds the customer app (its index.html and hashed assets are the
# template of every pre-rendered page) and the SSR bundle of site-kit's SitePage.
FROM public.ecr.aws/docker/library/node:22 AS build
WORKDIR /src
COPY . .
RUN npm ci && npm run build && npm --prefix render-lambda run build

FROM public.ecr.aws/lambda/nodejs:22
COPY --from=build /src/dist ${LAMBDA_TASK_ROOT}/app
COPY --from=build /src/render-lambda/dist ${LAMBDA_TASK_ROOT}/dist
COPY render-lambda/src ${LAMBDA_TASK_ROOT}/src
# The AWS SDK v3 clients (S3, DynamoDB) come with the nodejs:22 base image.
CMD ["src/index.handler"]
