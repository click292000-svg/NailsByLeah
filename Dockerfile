# Builds the website and the API into one image, so the site and API share one address.
# All settings and secrets come from the host's environment variables; none are in this image.

# 1. The website
FROM node:22-slim AS website
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. The API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY backend/NailsByLeah.Api.csproj backend/
RUN dotnet restore backend/NailsByLeah.Api.csproj
COPY backend/ backend/
RUN dotnet publish backend/NailsByLeah.Api.csproj --configuration Release --no-restore --output /app

# 3. What runs on the host
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
# Appointment times use Asia/Manila, so the time zone data must be present.
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=api /app ./
COPY --from=website /src/dist ./wwwroot
ENV ASPNETCORE_ENVIRONMENT=Production
# Render sends traffic to port 10000 by default and handles HTTPS in front of the app.
ENV ASPNETCORE_HTTP_PORTS=10000
EXPOSE 10000
# Not root: the app has no need to change its own files.
USER $APP_UID
ENTRYPOINT ["dotnet", "NailsByLeah.Api.dll"]
