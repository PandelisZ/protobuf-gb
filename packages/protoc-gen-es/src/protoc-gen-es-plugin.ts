// Copyright 2021-2024 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type {
  DescEnum, DescMessage
} from "@bufbuild/protobuf";
import { isWrapperDesc } from "@bufbuild/protobuf/wkt";
import {
  createEcmaScriptPlugin,
  type GeneratedFile,
  type Printable,
  type Schema,
  type Target,
} from "@bufbuild/protoplugin";
import { fieldJsonType, fieldTypeScriptType } from "./util";
import { version } from "../package.json";
import { RawPluginOptions } from "@bufbuild/protoplugin/dist/cjs/parameter";

export const protocGenEs = createEcmaScriptPlugin({
  name: "protoc-gen-types-only",
  version: `v${String(version)}`,
  parseOptions,
  generateTs,
});

type Options = {
  jsonTypes: boolean;
};

function parseOptions(options: RawPluginOptions): Options {
  let jsonTypes = false;
  for (const { key, value } of options) {
    switch (key) {
      case "json_types":
        if (!["true", "1", "false", "0"].includes(value)) {
          throw "please provide true or false";
        }
        jsonTypes = ["true", "1"].includes(value);
        break;
      default:
        throw new Error();
    }
  }
  return { jsonTypes };
}

// prettier-ignore
function generateTs(schema: Schema<Options>) {
  for (const file of schema.files) {
    const f = schema.generateFile(file.name + "_pb.ts");
    f.preamble(file);
    f.print();
    for (const desc of schema.typesInFile(file)) {
      switch (desc.kind) {
        case "message": {
          generateMessageJsonShape(f, desc, "ts");
          f.print();
          break;
        }
        case "enum": {
          generateEnumShape(f, desc);
          f.print();
          break;
        }
      }
    }
  }
}


function generateEnumShape(f: GeneratedFile, enumeration: DescEnum) {
  f.print(f.jsDoc(enumeration));
  f.print(f.export("enum", f.importShape(enumeration).name), " {");
  for (const value of enumeration.values) {
    if (enumeration.values.indexOf(value) > 0) {
      f.print();
    }
    f.print(f.jsDoc(value, "  "));
    f.print("  ", value.localName, " = ", value.number, ",");
  }
  f.print("}");
  f.print();
}

// prettier-ignore
function generateMessageJsonShape(f: GeneratedFile, message: DescMessage, target: Extract<Target, "ts" | "dts">) {
  const exp = f.export(target == "ts" ? "type" : "declare type", f.importShape(message).name);
  f.print(f.jsDoc(message));
  switch (message.typeName) {
    case "google.protobuf.Any":
      f.print(exp, " = {");
      f.print(`  "@type"?: string;`);
      f.print("};");
      break;
    case "google.protobuf.Timestamp":
      f.print(exp, " = string;");
      break;
    case "google.protobuf.Duration":
      f.print(exp, " = string;");
      break;
    case "google.protobuf.FieldMask":
      f.print(exp, " = string;");
      break;
    case "google.protobuf.Struct":
      f.print(exp, " = ", f.runtime.JsonObject, ";");
      break;
    case "google.protobuf.Value":
      f.print(exp, " = ", f.runtime.JsonValue, ";");
      break;
    case "google.protobuf.ListValue":
      f.print(exp, " = ", f.runtime.JsonValue, "[];");
      break;
    case "google.protobuf.Empty":
      f.print(exp, " = Record<string, never>;");
      break;
    default:
      if (isWrapperDesc(message)) {
        f.print(exp, " = ", fieldJsonType(message.fields[0]), ";");
      } else {
        f.print(exp, " = {");
        for (const field of message.fields) {
          f.print(f.jsDoc(field, "  "));
          let jsonName: Printable = field.jsonName;
          const startWithNumber = /^[0-9]/;
          const containsSpecialChar = /[^a-zA-Z0-9_$]/;
          if (jsonName === ""
            || startWithNumber.test(jsonName)
            || containsSpecialChar.test(jsonName)) {
            jsonName = f.string(jsonName);
          }

          const { typing, optional } = fieldTypeScriptType(field, f.runtime);
          if (optional) {
            f.print("  ", field.localName, "?: ", typing, ";");
          } else {
            f.print("  ", field.localName, ": ", typing, ";");
          }

          if (message.fields.indexOf(field) < message.fields.length - 1) {
            f.print();
          }
        }
        f.print("};");
      }
  }
  f.print();
}
