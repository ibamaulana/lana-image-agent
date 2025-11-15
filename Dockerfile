# Use an official Node.js runtime as a parent image
FROM node:22-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install any needed packages
RUN npm install

# Copy the rest of the application's code
COPY . .

# Make port 8000 available to the world outside this container
EXPOSE 8000

# Define the default command to run the app
# Note: This can be overridden in docker-compose.yml for the worker service
CMD [ "node", "server.js" ] 