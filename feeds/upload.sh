#!/bin/bash
LAMBDA_FUNC_NAME=feeds
PROJECT_PATH=~/Desktop/coin/lambda/${LAMBDA_FUNC_NAME}

cd ${PROJECT_PATH}
zip -r ${LAMBDA_FUNC_NAME}.zip .
aws lambda update-function-code --function-name ${LAMBDA_FUNC_NAME} --zip-file fileb://${PROJECT_PATH}/${LAMBDA_FUNC_NAME}.zip --region us-east-1
rm ${LAMBDA_FUNC_NAME}.zip
