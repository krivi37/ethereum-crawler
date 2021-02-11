# Ethereum-crawler
This application is an Ethereum crawler application. It is similar to a MEAN stack application, but without a database, since the database used is the Etherscan database.
It is consisted of 2 separate projects (apps) called backend and frontend and both need to be run for the application to work. 

#Prerequisites:
  1. Node.js
  2. Angular
 
#Steps for building and running the app:
  1. Clone this repository locally.
  2. Open a new terminal in the "backend" directory.
  3. Run npm init to install the needed dependencies.
  3. Run node index.js command, and now the backend part of the app is running at localhost:3000.
  4. Open a new terminal in the "frontend" directory.
  5. Run npm init to install the needed dependencies.
  5. Run ng serve command, and now the frontend part of the app is running at localhost:4200.
  6. Type in your browser localhost:4200 to access the app.

#How to use:
There are 2 options:
  1. You can search for all transactions for a given address starting for some block to the latest block
  2. You can get the ETH balance, and retrieve some of the token balance on a given date for the given account address by typing the address and selecting wanted date. The app    will show the token data only if the token transactions had happened from that date, until today's date.
#Known issues:
Since the app is retrieving erc20 token data, it might take a while to handle requests that retrieve a very large amount of transaction data (~2+ minutes). This is partly due to waiting for Etherscan API to return the requested data, and partly due to limitations imposed by Etherscan Free API Key that restricts us to 5 calls/sec. Also, since erc20token standard only requires a few functions to be implemented, this app shows the token data for functions that are required by erc20token standard and some of the more used functions like token swaps. Some of the contract specific function data won't be shown by this app.
