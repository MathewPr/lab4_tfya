function processString(input: string): string {
    let inputList = input.split('');
    for (let i = 0; i < inputList.length; i++) {
        if (inputList[i] === '*') {
            inputList[i] = '>';

            let openCount = 0;
            let closeCount = 0;
            for (let j = i - 1; j >= 0; j--) {
                if (inputList[j] === ')') {
                    closeCount++;
                } else if (inputList[j] === '(') {
                    openCount++;
                }
                if (openCount === closeCount && openCount > 0) {
                    inputList.splice(j, 0, '<');
                    break;
                }
            }
            break;
        }
    }
    return inputList.join('');
}

abstract class RegexNode {
    abstract toString(): string;
}

class ConcatNode extends RegexNode {
    children: RegexNode[];
    constructor(children: RegexNode[]) {
        super();
        this.children = children;
    }
    toString(): string {
        return `ConcatNode(${this.children.map(c => c.toString()).join(', ')})`;
    }
}

class AltNode extends RegexNode {
    children: RegexNode[];
    constructor(children: RegexNode[]) {
        super();
        this.children = children;
    }
    toString(): string {
        return `AltNode(${this.children.map(c => c.toString()).join(', ')})`;
    }
}

class CharNode extends RegexNode {
    char: string;
    constructor(char: string) {
        super();
        this.char = char;
    }
    toString(): string {
        return `CharNode('${this.char}')`;
    }
}

class GroupNode extends RegexNode {
    group_id: number;
    child: RegexNode;
    constructor(group_id: number, child: RegexNode) {
        super();
        this.group_id = group_id;
        this.child = child;
    }
    toString(): string {
        return `GroupNode(${this.group_id}, ${this.child.toString()})`;
    }
}

class StarNode extends RegexNode {
    child: RegexNode;
    minRepeats: number;
    maxRepeats: number;
    constructor(child: RegexNode, minRepeats = 0, maxRepeats = Infinity) {
        super();
        this.child = child;
        this.minRepeats = minRepeats;
        this.maxRepeats = maxRepeats;
    }
    toString(): string {
        return `StarNode(${this.child.toString()}, min=${this.minRepeats}, max=${this.maxRepeats})`;
    }
}

class ExprRefNode extends RegexNode {
    ref_id: number;
    constructor(ref_id: number) {
        super();
        this.ref_id = ref_id;
    }
    toString(): string {
        return `ExprRefNode(${this.ref_id})`;
    }
}

class StrRefNode extends RegexNode {
    ref_id: number;
    constructor(ref_id: number) {
        super();
        this.ref_id = ref_id;
    }
    toString(): string {
        return `StrRefNode(${this.ref_id})`;
    }
}

class RegexParser {
    regex: string;
    index: number = 0;
    group_id: number = 1;
    nodes_list: RegexNode[] = [];

    constructor(regex: string) {
        this.regex = regex;
    }

    parse(): RegexNode {
        return this._parseAlt();
    }

    private _parseConcat(): RegexNode {
        const nodes: RegexNode[] = [];
        while (this.index < this.regex.length) {
            const current = this.regex[this.index];
            if (current === '|' || current === ')' || current === '>') break;
            else {
                nodes.push(this._parseAtom());
            }
        }
        if (nodes.length > 1) {
            const node = new ConcatNode(nodes);
            this.nodes_list.push(node);
            return node;
        } else {
            return nodes[0];
        }
    }

    private _parseAlt(): RegexNode {
        const nodes: RegexNode[] = [this._parseConcat()];
        while (this.index < this.regex.length && this.regex[this.index] === '|') {
            this.index++;
            nodes.push(this._parseConcat());
        }
        if (nodes.length > 1) {
            const node = new AltNode(nodes);
            this.nodes_list.push(node);
            return node;
        } else {
            return nodes[0];
        }
    }

    private _parseGroup(capturable: boolean = true): RegexNode {
        let group_id: number;
        if (capturable) {
            this.index++;
            group_id = this.group_id;
            this.group_id++;
        } else {
            group_id = -1;
            this.index += 3;
        }
        const child = this._parseAlt();
        if (this.index >= this.regex.length || this.regex[this.index] !== ')') {
            throw new Error("Unmatched '(' in regex");
        }
        this.index++;
        const groupNode = new GroupNode(group_id, child);
        this.nodes_list.push(groupNode);
        return groupNode;
    }

    private _parseStar(): RegexNode {
        this.index++;
        const child = this._parseAlt();
        if (this.index >= this.regex.length || this.regex[this.index] !== '>') {
            throw new Error("Unmatched '>' in regex");
        }
        this.index++;
        const starNode = new StarNode(child);
        this.nodes_list.push(starNode);
        return starNode;
    }

    private _parseAtom(): RegexNode {
        const current = this.regex[this.index];
        if (current === '(') {
            if (this.regex[this.index + 1] === '\\') {
                this.index += 2;
                if (this.index < this.regex.length && /\d/.test(this.regex[this.index])) {
                    const ref_id = parseInt(this.regex[this.index]);
                    this.index += 2;
                    const node = new StrRefNode(ref_id);
                    this.nodes_list.push(node);
                    return node;
                }
            } else if (this.regex[this.index + 1] === '?') {
                this.index += 2;
                if (this.index < this.regex.length && /\d/.test(this.regex[this.index])) {
                    const ref_id = parseInt(this.regex[this.index]);
                    this.index += 2;
                    const node = new ExprRefNode(ref_id);
                    this.nodes_list.push(node);
                    return node;
                } else if (this.index < this.regex.length && this.regex[this.index] === ':') {
                    this.index -= 2;
                    return this._parseGroup(false);
                }
            } else {
                return this._parseGroup();
            }
        } else if (current === '<') {
            return this._parseStar();
        } else {
            this.index++;
            const node = new CharNode(current);
            this.nodes_list.push(node);
            return node;
        }
        throw new Error("Unrecognized pattern in _parseAtom");
    }
}

class Validator {
    parser: RegexParser;
    node: RegexNode;
    unused_groups: number[] = [];

    constructor(parser: RegexParser, node: RegexNode) {
        this.parser = parser;
        this.node = node;
    }

    validate(): boolean {
        return this.validate1() && this.validate2();
    }

    validate1(): boolean {
        return this.parser.group_id <= 10;
    }

    validate2(): boolean {
        const s = new Set<number>();
        for (const x of this.parser.nodes_list) {
            if (x instanceof StrRefNode) {
                s.add(x.ref_id);
            }
            if (x instanceof GroupNode && s.has(x.group_id)) {
                return false;
            }
        }
        return true;
    }

    traverse(node: RegexNode, inlevel: number): void {
        return;
    }
}

function printConcatNode(node: ConcatNode, indent: number = 0): void {
    const pad = " ".repeat(indent);
    console.log(`${pad}ConcatNode`);
    console.log(`${pad}(`);
    for (const child of node.children) {
        printNode(child, indent + 4);
    }
    console.log(`${pad})`);
}

function printAltNode(node: AltNode, indent: number = 0): void {
    const pad = " ".repeat(indent);
    console.log(`${pad}AltNode`);
    console.log(`${pad}(`);
    for (const child of node.children) {
        printNode(child, indent + 4);
    }
    console.log(`${pad})`);
}

function printGroupNode(node: GroupNode, indent: number = 0): void {
    const pad = " ".repeat(indent);
    console.log(`${pad}GroupNode`);
    console.log(`${pad}(${node.group_id},`);
    printNode(node.child, indent + 4);
    console.log(`${pad})`);
}

function printStarNode(node: StarNode, indent: number = 0): void {
    const pad = " ".repeat(indent);
    console.log(`${pad}StarNode`);
    console.log(`${pad}(`);
    printNode(node.child, indent + 4);
    console.log(`${pad})`);
}

function printNode(node: RegexNode, indent: number = 0): void {
    const pad = " ".repeat(indent);
    if (node instanceof ConcatNode) {
        printConcatNode(node, indent);
    } else if (node instanceof AltNode) {
        printAltNode(node, indent);
    } else if (node instanceof GroupNode) {
        printGroupNode(node, indent);
    } else if (node instanceof StarNode) {
        printStarNode(node, indent);
    } else if (node instanceof CharNode) {
        console.log(`${pad}CharNode('${node.char}')`);
    } else if (node instanceof ExprRefNode) {
        console.log(`${pad}ExprRefNode(${node.ref_id})`);
    } else if (node instanceof StrRefNode) {
        console.log(`${pad}StrRefNode(${node.ref_id})`);
    } else {
        throw new Error("Неизвестный тип узла");
    }
}

class CFGBuilder {
    node: RegexNode;
    groupNonterm: { [groupId: number]: string } = {};
    ncg_index: number = 1;
    alt_index: number = 1;
    star_index: number = 1;
    char_index: number = 1;
    concat_index: number = 1;
    rules: { [nonterm: string]: string[][] } = {};

    constructor(node: RegexNode) {
        this.node = node;
    }

    build(node: RegexNode): { start: string; rules: { [nonterm: string]: (string[] | string)[] } } {
        const start = "S";
        this.rules[start] = [[this.processNode(node)]];
        return { start, rules: this.rules };
    }

    processNode(node: RegexNode): string {
        const nodeType = node.constructor.name;
        if (nodeType in this.processors) {
            return this.processors[nodeType](node);
        } else {
            throw new Error(`Неизвестный тип узла ${nodeType}`);
        }
    }

    processors: { [key: string]: (node: RegexNode) => string } = {
        "CharNode": (node: RegexNode) => this.processCharNode(node as CharNode),
        "GroupNode": (node: RegexNode) => this.processGroupNode(node as GroupNode),
        "ConcatNode": (node: RegexNode) => this.processConcatNode(node as ConcatNode),
        "AltNode": (node: RegexNode) => this.processAltNode(node as AltNode),
        "ExprRefNode": (node: RegexNode) => this.refNode(node as ExprRefNode),
        "StrRefNode": (node: RegexNode) => this.refNode(node as StrRefNode),
        "StarNode": (node: RegexNode) => this.starNode(node as StarNode),
    };

    processCharNode(node: CharNode): string {
        const nt = this.generateUniqueNT("Char");
        if (!this.rules[nt]) this.rules[nt] = [];
        this.rules[nt].push([node.char]);
        return nt;
    }

    processGroupNode(node: GroupNode): string {
        let nt = this.groupNonterm[node.group_id];
        if (!nt) {
            nt = node.group_id !== -1 ? `G${node.group_id}` : this.generateUniqueNT("Ncg");
            this.groupNonterm[node.group_id] = nt;
        }
        const sub_nt = this.processNode(node.child);
        if (!this.rules[nt]) this.rules[nt] = [];
        this.rules[nt].push([sub_nt]);
        return nt;
    }

    processConcatNode(node: ConcatNode): string {
        const nt = this.generateUniqueNT("C");
        const seq_nts = node.children.map(ch => this.processNode(ch));
        if (!this.rules[nt]) this.rules[nt] = [];
        this.rules[nt].push(seq_nts);
        return nt;
    }

    processAltNode(node: AltNode): string {
        const nt = this.generateUniqueNT("A");
        if (!this.rules[nt]) this.rules[nt] = [];
        for (const branch of node.children) {
            const br_nt = this.processNode(branch);
            this.rules[nt].push([br_nt]);
        }
        return nt;
    }

    refNode(node: ExprRefNode | StrRefNode): string {
        const ref_id = node.ref_id;
        if (!(ref_id in this.groupNonterm)) {
            this.groupNonterm[ref_id] = `G${ref_id}`;
        }
        return this.groupNonterm[ref_id];
    }

    starNode(node: StarNode): string {
        const nt = this.generateUniqueNT("R");
        const sub_nt = this.processNode(node.child);
        if (!this.rules[nt]) this.rules[nt] = [];
        this.rules[nt].push([sub_nt]);
        this.rules[nt][this.rules[nt].length - 1].push(nt);
        this.rules[nt].push(["Eps"]);
        return nt;
    }

    generateUniqueNT(prefix: string): string {
        let name = "";
        if (prefix === "Ncg") {
            name = `Ncg${this.ncg_index}`;
            this.ncg_index++;
        } else if (prefix === "A") {
            name = `R${this.alt_index}`;
            this.alt_index++;
        } else if (prefix === "C") {
            name = `C${this.concat_index}`;
            this.concat_index++;
        } else if (prefix === "Char") {
            name = `Char${this.char_index}`;
            this.char_index++;
        } else if (prefix === "R") {
            name = `R${this.star_index}`;
            this.star_index++;
        }
        return name;
    }
}

function buildAttributeGrammar(node: RegexNode): any {
    if (node instanceof CharNode) {
        return { type: 'Char', value: node.char, length: 1 };
    } else if (node instanceof ConcatNode) {
        const children = node.children.map(buildAttributeGrammar);
        const length = children.reduce((sum, child) => sum + child.length, 0);
        return { type: 'Concat', children, length };
    } else if (node instanceof AltNode) {
        const children = node.children.map(buildAttributeGrammar);
        return { type: 'Alt', children };
    } else if (node instanceof GroupNode) {
        const child = buildAttributeGrammar(node.child);
        return { type: 'Group', groupId: node.group_id, child, length: child.length };
    } else if (node instanceof StarNode) {
        const child = buildAttributeGrammar(node.child);
        return { type: 'Star', child, minRepeats: node.minRepeats, maxRepeats: node.maxRepeats };
    } else if (node instanceof ExprRefNode) {
        return { type: 'ExprRef', refId: node.ref_id };
    } else if (node instanceof StrRefNode) {
        return { type: 'StrRef', refId: node.ref_id };
    }

    console.error("Ошибка: неизвестный тип узла", node);
    throw new Error("Неизвестный тип узла");
}

function formatAttributeGrammar(grammar: any, indent: string = '', isLast: boolean = true): string {
    let result = indent + (isLast ? '└── ' : '├── ');

    if (grammar.type === 'Concat') {
        result += `Concat\n`;
    } else if (grammar.type === 'Group') {
        result += `Group (id=${grammar.groupId})\n`;
    } else if (grammar.type === 'Char') {
        result += `Char ('${grammar.value}') [length=${grammar.length}]\n`;
    } else if (grammar.type === 'ExprRef') {
        result += `ExprRef (id=${grammar.refId})\n`;
    } else if (grammar.type === 'StrRef') {
        result += `StrRef (id=${grammar.refId})\n`;
    } else if (grammar.type === 'Alt') {
        result += `Alt\n`;
    } else if (grammar.type === 'Star') {
        const maxRepeats = grammar.maxRepeats === null ? '∞' : grammar.maxRepeats;
        result += `Star (min=${grammar.minRepeats}, max=${maxRepeats})\n`;
    }

    if (grammar.length !== undefined && grammar.length !== null) {
        result += indent + (isLast ? '    ' : '│   ') + `└── [length=${grammar.length}]\n`;
    }

    const children = grammar.children || (grammar.child ? [grammar.child] : []);
    if (children.length > 0) {
        children.forEach((child: any, index: number) => {
            const lastChild = index === children.length - 1;
            result += formatAttributeGrammar(child, indent + (isLast ? '    ' : '│   '), lastChild);
        });
    }

    return result;
}



const regex = "(a|(bb)(\\1))(a|(?2))";
const regexMod = processString(regex);
const parser = new RegexParser(regexMod);
const rootNode = parser.parse();

const validator = new Validator(parser, rootNode);
validator.traverse(rootNode, 0);
if (!validator.validate()) {
    console.log("incorrect expression");
} else {
    console.log("correct expression");
}

console.log(regex);
printNode(rootNode);

const cfgBuilder = new CFGBuilder(rootNode);
const { start, rules } = cfgBuilder.build(rootNode);

console.log();
console.log("КС-грамматика:");
console.log();
for (const nt in rules) {
    for (const production of rules[nt]) {
        const prodStr = Array.isArray(production) ? production.join("") : production;
        console.log(`${nt} -> ${prodStr}`);
    }
}

const attrGrammar = buildAttributeGrammar(rootNode);
console.log("Атрибутная грамматика:", JSON.stringify(attrGrammar, null, 2));
console.log(formatAttributeGrammar(attrGrammar));

