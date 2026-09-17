FROM node:24-alpine
WORKDIR /srv/api
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]
