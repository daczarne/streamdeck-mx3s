#!/usr/bin/env node
/**
 * Checks the doc comments the style guide asks for, in its "Doc comments" section:
 * - every function, class, method and constructor declared at the top of a file, or in a class there, has one
 * - in JavaScript, it gives every parameter a `@param` and every function a `@returns`, each with its type
 *
 * It reads the files Biome checks, and parses them with the repo's TypeScript, which attaches a doc comment to a
 * declaration as the editor shows it: one between a class's decorator and the class isn't attached, and is reported.
 */
import { globSync, readFileSync } from "node:fs";
import ts from "typescript";

// The code the rule covers: the plugin, its tests, the scripts and the settings pages' scripts. Keep in step with
// `files.includes` in biome.json.
const FILES = [
  "src/**/*.ts",
  "browser-tests/**/*.ts",
  "scripts/**/*.mjs",
  "scripts/**/*.test.ts",
  "*.mjs",
  "com.daczarne.mx3s.sdPlugin/ui/*.js",
];

/**
 * @typedef {object} Declaration
 * @property {ts.Node} node the node the doc comment attaches to
 * @property {string} kind what the declaration is, as the report names it
 * @property {string} name its name, as the report names it
 * @property {ts.SignatureDeclaration} [signature] the function it declares, whose parameters and result are documented
 */

const errors = [];

/**
 * A declaration's name, as written in the file, or a stand-in for one that has none, such as `export default class`.
 *
 * @param {ts.Node | undefined} name the declaration's name node
 * @param {ts.SourceFile} file the file it's in
 * @returns {string}
 */
function nameOf(name, file) {
  return name === undefined ? "(anonymous)" : name.getText(file);
}

/**
 * The function a variable or a class property holds, when it's set to one where it's declared.
 *
 * @param {ts.Expression | undefined} initializer what the variable or property is set to
 * @returns {ts.ArrowFunction | ts.FunctionExpression | undefined}
 */
function functionIn(initializer) {
  if (initializer === undefined) {
    return undefined;
  }
  return ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer) ? initializer : undefined;
}

/**
 * The members of a class the rule covers: its constructor, methods and accessors, and the properties set to a
 * function, which are methods written as fields.
 *
 * @param {ts.ClassLikeDeclaration} cls the class
 * @param {ts.SourceFile} file the file it's in
 * @returns {Declaration[]}
 */
function membersOf(cls, file) {
  /** @type {Declaration[]} */
  const members = [];
  for (const member of cls.members) {
    if (ts.isConstructorDeclaration(member)) {
      members.push({ node: member, kind: "constructor", name: nameOf(cls.name, file), signature: member });
    } else if (ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member)) {
      members.push({ node: member, kind: "method", name: nameOf(member.name, file), signature: member });
    } else if (ts.isPropertyDeclaration(member)) {
      const fn = functionIn(member.initializer);
      if (fn !== undefined) {
        members.push({ node: member, kind: "method", name: nameOf(member.name, file), signature: fn });
      }
    }
  }
  return members;
}

/**
 * The declarations at the top of a file, and in its classes, that the rule covers.
 *
 * @param {ts.SourceFile} file the parsed file
 * @returns {Declaration[]}
 */
function declarationsOf(file) {
  /** @type {Declaration[]} */
  const declarations = [];
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      declarations.push({
        node: statement,
        kind: "function",
        name: nameOf(statement.name, file),
        signature: statement,
      });
    } else if (ts.isClassDeclaration(statement)) {
      declarations.push({ node: statement, kind: "class", name: nameOf(statement.name, file) });
      declarations.push(...membersOf(statement, file));
    } else if (ts.isVariableStatement(statement)) {
      for (const variable of statement.declarationList.declarations) {
        const initializer = variable.initializer;
        const name = nameOf(variable.name, file);
        const fn = functionIn(initializer);
        if (fn !== undefined) {
          declarations.push({ node: variable, kind: "function", name, signature: fn });
        } else if (initializer !== undefined && ts.isClassExpression(initializer)) {
          declarations.push({ node: variable, kind: "class", name });
          declarations.push(...membersOf(initializer, file));
        }
      }
    }
  }
  return declarations;
}

/**
 * The doc comment attached to a declaration, the last one when there are several, or undefined when there's none.
 *
 * @param {ts.Node} node the declaration
 * @returns {ts.JSDoc | undefined}
 */
function docOf(node) {
  return ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc).at(-1);
}

/**
 * What a JavaScript doc comment misses of its function: a typed `@param` for each parameter, and a typed `@returns`,
 * which a constructor and a setter don't have.
 *
 * @param {ts.SignatureDeclaration} signature the function
 * @param {ts.SourceFile} file the file it's in
 * @returns {string[]}
 */
function missingTags(signature, file) {
  const missing = [];
  for (const parameter of signature.parameters) {
    const tag = ts.getJSDocParameterTags(parameter)[0];
    const name = ts.isIdentifier(parameter.name) ? parameter.name.text : parameter.name.getText(file);
    if (tag === undefined) {
      missing.push(`a @param for ${name}`);
    } else if (tag.typeExpression === undefined) {
      missing.push(`a type in the @param for ${name}`);
    }
  }
  if (!ts.isConstructorDeclaration(signature) && !ts.isSetAccessor(signature)) {
    const tag = ts.getJSDocReturnTag(signature);
    if (tag === undefined) {
      missing.push("a @returns");
    } else if (tag.typeExpression === undefined) {
      missing.push("a type in its @returns");
    }
  }
  return missing;
}

for (const path of globSync(FILES).sort()) {
  const javascript = /\.m?js$/.test(path);
  const file = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    javascript ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
  for (const { node, kind, name, signature } of declarationsOf(file)) {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    if (docOf(node) === undefined) {
      errors.push(`${path}:${line}: ${kind} ${name} has no doc comment`);
    } else if (javascript && signature !== undefined) {
      const missing = missingTags(signature, file);
      if (missing.length > 0) {
        errors.push(`${path}:${line}: the doc comment of ${kind} ${name} lacks ${missing.join(", ")}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("check-docs: OK (every function, class, method and constructor has a doc comment)");
