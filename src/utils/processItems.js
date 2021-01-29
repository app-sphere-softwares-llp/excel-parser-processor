import path from "path";
import {createWriteStream, mkdir} from "fs";
import fetch from "electron-fetch";
import {URL} from "url";
import xlsx from "node-xlsx";

const validators = require("./../../validation.json");

// var data1 = require('./../../data.json');

let initialItemsLength;
let processedItemsCount;
let incompatibleItems = [];
let erroneousItems = [];

const _resetProcessData = () => {
  initialItemsLength = 0;
  processedItemsCount = 0;
  incompatibleItems.length = 0;
  erroneousItems.length = 0;
};

// const validators = data1;

const processItem = async (item, outputPath) => {
  const [itemUrl, newName, subFolderName] = item;
  const url = new URL(itemUrl);
  const itemName = newName
    ? `${newName}${path.extname(url.pathname)}`
    : path.basename(url.pathname);

  const response = await fetch(itemUrl);

  if (response.ok) {
    if (subFolderName) {
      await mkdir(
        `${outputPath}/${subFolderName}`,
        {recursive: true},
        () => {
        }
      );
    }

    const dest = createWriteStream(
      path.join(outputPath, subFolderName ? subFolderName : "", itemName)
    );

    response.body.pipe(dest);
  } else {
    throw {
      status: response.status,
      statusText: response.statusText,
      itemInfo: url.href,
    };
  }
};

const processItems = async (rowItems, outputPath, win) => {
  const itemsLength = rowItems.length;

  for (let i = 0; i < itemsLength; i += 20) {
    const requests = rowItems.slice(i, i + 20).map((item) => {
      return processItem(item, outputPath)
        .then(() => {
          const unprocessedItems =
            erroneousItems.length + incompatibleItems.length;
          const percentage =
            Math.abs(
              ++processedItemsCount / (initialItemsLength - unprocessedItems)
            ) * 100;

          win.webContents.send("main-message", {
            type: "progress",
            data: percentage,
          });
        })
        .catch((err) => {
          erroneousItems.push(err.itemInfo);

          win.webContents.send("main-message", {
            type: "process-error",
            data: err,
          });
        });
    });

    await Promise.all(requests).catch((e) =>
      console.log(`Error processing for the batch ${i} - ${e}`)
    );
  }

  const logFileStream = createWriteStream(
    path.join(outputPath, `excel-parser-processor-log${Date.now()}.txt`)
  );

  logFileStream.write(
    [
      `Processed Items Count: ${processedItemsCount}`,
      "-----",
      `Incompatible Items Count: ${incompatibleItems.length};`,
      `${incompatibleItems.join("\r\n")}`,
      "-----",
      `Erroneous Items Count: ${erroneousItems.length};`,
      `${erroneousItems.join("\r\n")}`,
      "-----",
    ].join("\r\n"),
    "utf8"
  );

  logFileStream.on("finish", () => {
    win.webContents.send("main-message", {
      type: "process-completed",
      data: {
        processedItemsCount,
        incompatibleItems,
        erroneousItems,
        logFilePath: logFileStream.path,
      },
    });
  });

  logFileStream.end();
};

// function which will read excel and match it with Validator Object
export const processFile = async (filePath, outputPath, browserWindow) => {
  _resetProcessData();

  browserWindow.webContents.send("main-message", {
    type: "process-started",
  });

  const workSheetsFromFile = xlsx.parse(filePath);
  const dataRows = workSheetsFromFile.flatMap((page) => page.data);
  const columns = dataRows.shift();
  const missingColumns = areAllColumnsThere(columns);
  const invalidlengthColumns = isRowValid(dataRows, columns);

  // const validRows = dataRows.filter((row) => row.some((text) => isUrl(text)));

  // incompatibleItems = dataRows.filter(
  //   (row) => !row.some((text) => isUrl(text))
  // );

  // initialItemsLength = validRows.length;

  if (missingColumns.length || invalidlengthColumns.length) {

    const missingColumnsMessages = missingColumns.map((column) => {
      return `${column} is missing in the excel`;
    });
    const messages = invalidlengthColumns.map(column => {
      return constructErrorString(column);
    });

    browserWindow.webContents.send("main-message", {
      type: "file-error",
      data: {
        title: "These are the missing columns and invalid length values respectively:",
        message: missingColumnsMessages.join(" \n ") + (".") + (" \n ") + messages.join('\n'),
      },
    });
  } else {
    win.webContents.send("main-message", {
      type: "process-completed",
      data: {},
    });
  }

  // if (initialItemsLength) {
  //   browserWindow.webContents.send('main-message', {
  //     type: 'process-started'
  //   });

  //   await processItems(validRows, outputPath, browserWindow);
  // } else {
  //   browserWindow.webContents.send('main-message', {
  //     type: 'file-error',
  //     data: ' These are the missing columns : ' + missingColumns.join(',') + 'These are invalid length values :' + invalidlength.join(',') +
  //       '. Please enter valid excel file.'
  //   });
  // }
};

export const areAllColumnsThere = (columns) => {
  const requiredColumns = Object.keys(validators).filter(
    (key) => validators[key].isRequired
  );

  const missingColumns = [];
  requiredColumns.forEach((col) => {
    if (!columns.includes(col)) {
      missingColumns.push(col);
    }
  });

  return missingColumns;
};

export const isRowValid = (dataRows, columns) => {
  const invalidlength = [];

  dataRows.forEach((dataRow, rowIndex) => {
    dataRow.forEach((dataRowVal, index) => {
      const validatorColumn = validators[columns[index]];
      if (validatorColumn) {
        if (validatorColumn.minLength) {
          if (validatorColumn.minLength > dataRowVal.length) {
            invalidlength.push({
              column: columns[index],
              requiredLength: validatorColumn.minLength,
              actualLength: dataRowVal.length,
              row: rowIndex,
              value: dataRowVal,
              validator: 'Min Length'
            });
          }
        }

        if (validatorColumn.maxLength) {
          if (dataRowVal.length > validatorColumn.maxLength) {
            invalidlength.push({
              column: columns[index],
              requiredLength: validatorColumn.maxLength,
              actualLength: dataRowVal.length,
              row: rowIndex,
              value: dataRowVal,
              validator: 'Max Length'
            });
          }
        }
      }
    });
  });
  return invalidlength;
};


const constructErrorString = (data) => {
  return `${data.validator} error found at, row no ${data.row} for column ${data.column}. required length is ${data.requiredLength} and got ${data.actualLength} (passed value :- ${data.value})`;
};
