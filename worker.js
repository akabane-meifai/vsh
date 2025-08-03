class ApplicationBase{
	constructor(context){
		Object.assign(this, context);
	}
	main(args){
		return 1;
	}
}
class EnvironmentBase{
	constructor(launcher){
		this.launcher = launcher;
	}
	main(){
		return "";
	}
}
class Launcher{
	constructor(command, environments, currentDirectory){
		const tokens = [];
		let esc = false;
		let pre = null;
		let add = true;
		let op = false;
		let n = -1;
		for(let ch of command){
			let v = null;
			if(esc){
				if(ch == "\""){
					esc = false;
				}else if(ch == "%"){
					v = "%%";
				}else{
					v = ch;
				}
				pre = ch;
			}else if(pre == "^"){
				v = (ch == "%") ? "%%" : ch;
				pre = null;
			}else if(op){
				if(ch == "\""){
					op = false;
					add = true;
					esc = true;
				}else if(ch == "^"){
					op = false;
					add = true;
				}else if(ch == "|"){
					tokens[n].op += ch;
				}else if(ch == "&"){
					tokens[n].op += ch;
				}else if(ch == ">"){
					tokens[n].op += ch;
				}else if(ch == "<"){
					tokens[n].op += ch;
				}else if(ch == " "){
					op = false;
					add = true;
				}else{
					op = false;
					add = true;
					v = ch;
				}
				pre = ch;
			}else{
				if(ch == "\""){
					esc = true;
					if(pre == "\""){
						v = ch;
					}
				}else if(ch == "^"){
				}else if(ch == "|"){
					op = true;
					add = false;
					v = ch;
				}else if(ch == "&"){
					op = true;
					add = false;
					v = ch;
				}else if(ch == ">"){
					op = true;
					add = false;
					if(/^[0-9]$/.test(pre) && /^[0-9]+$/.test(tokens[n])){
						v = tokens.pop() + ch;
					}else{
						v = ch;
					}
				}else if(ch == "<"){
					op = true;
					add = false;
					v = ch;
				}else if(ch == " "){
					add = true;
				}else{
					v = ch;
				}
				pre = ch;
			}
			if(v == null){
				continue;
			}
			if(add){
				n = tokens.length;
				tokens.push(v);
				add = false;
			}else if(op){
				n = tokens.length;
				tokens.push({op: v});
			}else{
				tokens[n] += v;
			}
		}
		this.cd = new URL(currentDirectory.replace(/[\/]*$/, "/"), "opfs:///");
		this.rootDir = null;
		this.environments = environments;
		this.tokens = tokens.map(token => {
			if(typeof token == "string"){
				return token.replaceAll(/%(.*?)%/g, (_, env) => {
					if(env == ""){
						return "%";
					}
					const upper = env.toUpperCase();
					if(upper in this.constructor.envs){
						return new this.constructor.envs[upper](this).main();
					}
					return environments[upper] ?? "";
				});
			}
			return token;
		});
	}
	launch(ports){
		const tokens = this.tokens;
		const cmdRoot = {chain: {}};
		const cmdChains = ["|", "&&", "||"];
		let cmdRef = cmdRoot;
		let pos = 0;
		let executable = false;
		let op = null;
		while(pos < tokens.length){
			const pre = pos;
			pos = tokens.findIndex((token, i) => (i >= pos) && (typeof token != "string"), pre);
			if(pos == 0){
				executable = false;
				break;
			}
			const part = (pos > 0) ? tokens.slice(pre, pos) : tokens.slice(pre);
			if(part.length == 0){
				executable = false;
				break;
			}
			if(op == null){
				cmdRef.args = part;
				executable = true;
			}else{
				if((!executable) || (part.length != 1)){
					break;
				}
				cmdRef.chain[op] = part.at(0);
			}
			if(pos > 0){
				if(cmdChains.includes(tokens[pos]?.op)){
					cmdRef.chain[tokens[pos].op] = {chain: {}};
					cmdRef = cmdRef.chain[tokens[pos].op];
					op = null;
					executable = false;
				}else{
					op = tokens[pos]?.op ?? "";
				}
				pos++;
			}else{
				break;
			}
		}
		if(cmdChains.includes(op)){
			executable = false;
		}
		if(executable){
			const resolvers = Promise.withResolvers();
			let p = resolvers.promise;
			let op2 = "&&";
			let pipe = null;
			cmdRef = cmdRoot;
			while(cmdRef != null){
				const cargs = cmdRef.args;
				const cmd = cargs.at(0);
				const context = {
					stdin: null,
					stdout: null,
					stderr: null,
					environments: this.environments,
					file: {getResponse: req => { return this.getResponse(req); }},
					cd: dir => { this.cd = new URL(dir.replace(/[\/]*$/, "/"), this.cd.href); }
				};
				const disposals = [];
				if(!(cmd in this.constructor.commands)){
					executable = false;
					break;
				}
				if(op2 == "|"){
					p = p.then(() => {
						try{
							const app = new this.constructor.commands[cmd](context);
							const res = app.main(cargs);
							if(res instanceof Promise){
								return res.then(
									result => Promise.all(disposals.map(item => item())).then(() => Promise.resolve(result)),
									result => Promise.all(disposals.map(item => item())).then(() => Promise.reject(result))
								);
							}
							return Promise.all(disposals.map(item => item())).then(() => Promise.resolve(res));
						}catch(ex){
							return Promise.all(disposals.map(item => item())).then(() => Promise.reject(ex));
						}
					});
					context.stdin = pipe;
				}else if(op2 == "&&"){
					p = p.then(() => {
						try{
							const app = new this.constructor.commands[cmd](context);
							const res = app.main(cargs);
							if(res instanceof Promise){
								return res.then(
									result => Promise.all(disposals.map(item => item())).then(() => Promise.resolve(result)),
									result => Promise.all(disposals.map(item => item())).then(() => Promise.reject(result))
								);
							}
							return Promise.all(disposals.map(item => item())).then(() => Promise.resolve(res));
						}catch(ex){
							return Promise.all(disposals.map(item => item())).then(() => Promise.reject(ex));
						}
					});
				}else if(op2 == "||"){
					p = p.catch(() => {
						try{
							const app = new this.constructor.commands[cmd](context);
							const res = app.main(cargs);
							if(res instanceof Promise){
								return res.then(
									result => Promise.all(disposals.map(item => item())).then(() => Promise.resolve(result)),
									result => Promise.all(disposals.map(item => item())).then(() => Promise.reject(result))
								);
							}
							return Promise.all(disposals.map(item => item())).then(() => Promise.resolve(res));
						}catch(ex){
							return Promise.all(disposals.map(item => item())).then(() => Promise.reject(ex));
						}
					});
				}
				if("|" in cmdRef.chain){
					pipe = {
						getStream(){
							return Promise.resolve(new Blob(this.data).stream());
						},
						data: []
					};
					context.stdout = {
						write(byteArray){
							this.process.data.push(byteArray);
							return Promise.resolve(null);
						},
						process: pipe
					};
				}
				if((context.stdout == null) && (">>" in cmdRef.chain)){
					const stdoutObject = context.stdout = {
						write(byteArray){
							this.buffer.push(byteArray);
							Promise.resolve(null);
						},
						buffer: [],
						process: this,
						filename: cmdRef.chain[">>"]
					};
					disposals.push(() => {
						new Blob(stdoutObject.buffer).arrayBuffer()
						.then(buffer => stdoutObject.process.writeFileData(stdoutObject.filename, buffer, true))
					});
				}
				if((context.stdout == null) && (">" in cmdRef.chain)){
					const stdoutObject = context.stdout = {
						write(byteArray){
							this.buffer.push(byteArray);
							Promise.resolve(null);
						},
						buffer: [],
						process: this,
						filename: cmdRef.chain[">"]
					};
					disposals.push(() => {
						new Blob(stdoutObject.buffer).arrayBuffer()
						.then(buffer => stdoutObject.process.writeFileData(stdoutObject.filename, buffer, false))
					});
				}
				if((context.stderr == null) && ("2>" in cmdRef.chain)){
					const stderrObject = context.stderr = {
						write(byteArray){
							this.buffer.push(byteArray);
							Promise.resolve(null);
						},
						buffer: [],
						process: this,
						filename: cmdRef.chain["2>"]
					};
					disposals.push(() => {
						new Blob(stderrObject.buffer).arrayBuffer()
						.then(buffer => stderrObject.process.writeFileData(stderrObject.filename, buffer, false))
					});
				}
				if((context.stdin == null) && ("<" in cmdRef.chain)){
					context.stdin = {
						getStream(){
							return this.process
							.getResponse(this.filename)
							.then(res => Promise.resolve(res.body));
						},
						process: this,
						filename: cmdRef.chain["<"]
					};
				}
				if(context.stdout == null){
					context.stdout = {
						write(byteArray){
							this.process.postMessage(byteArray.buffer, [byteArray.buffer]);
							Promise.resolve(null);
						},
						process: ports[1]
					};
				}
				if(context.stdin == null){
					context.stdin = this.createInputPortStream(ports[0]);
				}
				if(context.stderr == null){
					context.stderr = {
						write(byteArray){
							this.process.postMessage(byteArray.buffer, [byteArray.buffer]);
							Promise.resolve(null);
						},
						process: ports[2]
					};
				}
				if("|" in cmdRef.chain){
					cmdRef = cmdRef.chain[op2 = "|"];
					continue;
				}
				if("&&" in cmdRef.chain){
					cmdRef = cmdRef.chain[op2 = "&&"];
					continue;
				}
				if("||" in cmdRef.chain){
					cmdRef = cmdRef.chain[op2 = "||"];
					continue;
				}
				cmdRef = null;
			}
			if(executable){
				resolvers.resolve(null);
				return p;
			}
		}
		for(let handler of this.constructor.handlers){
			handler(tokens);
		}
		return Promise.resolve(null);
	}
	createInputPortStream(port){
		return {
			getStream(){
				return Promise.resolve(new ReadableStream({
					start(controller){
						this.controller = controller;
						this.port.addEventListener("message", this);
						this.port.start();
					},
					handleEvent(e){
						if(e.data == null){
							this.controller.close();
							this.port.removeEventListener("message", this);
							this.port.close();
							return;
						}
						this.controller.enqueue(e.data);
					},
					controller: null,
					port: this.process
				}));
			},
			process: port
		};
	}
	getResponse(file){
		if(/^blob:(?:null|https?:\/\/[^\/]+|file:\/\/)\/[0-9a-fA-F\-]+$|^data:([a-zA-Z]+\/[a-zA-Z0-9\-\+\.]+)?(;[=a-zA-Z0-9\-]+)*,/.test(file)){
			return fetch(file);
		}
		const target = new URL(file, this.cd.href);
		if(target.protocol == "opfs:"){
			const path = target.pathname.slice(1).split("/").map(decodeURIComponent);
			const filename = path.pop();
			let p = (this.rootDir == null)
				? navigator.storage.getDirectory().then(root => {
					this.rootDir = root; 
					return Promise.resolve(this.rootDir);
				})
				: Promise.resolve(this.rootDir);
			for(let item of path){
				const dirname = item;
				p = p.then(dir => dir.getDirectoryHandle(dirname));
			}
			return p
			.then(dir => dir.getFileHandle(filename))
			.then(handle => handle.getFile())
			.then(file => {
				return Promise.resolve(new Response(file));
			}, error => Promise.resolve(new Response()));
		}
		return Promise.resolve(new Response());
	}
	writeFileData(file, data, append = false){
		if(/^blob:(?:null|https?:\/\/[^\/]+|file:\/\/)\/[0-9a-fA-F\-]+$|^data:([a-zA-Z]+\/[a-zA-Z0-9\-\+\.]+)?(;[=a-zA-Z0-9\-]+)*,/.test(file)){
			return Promise.reject(null);
		}
		const target = new URL(file, this.cd.href);
		if(target.protocol == "opfs:"){
			const path = target.pathname.slice(1).split("/").map(decodeURIComponent);
			const filename = path.pop();
			let p = (this.rootDir == null)
				? navigator.storage.getDirectory().then(root => {
					this.rootDir = root; 
					return Promise.resolve(this.rootDir);
				})
				: Promise.resolve(this.rootDir);
			for(let item of path){
				const dirname = item;
				p = p.then(dir => dir.getDirectoryHandle(dirname, {create: true}));
			}
			return p
			.then(dir => dir.getFileHandle(filename, {create: true}))
			.then(handle => handle.createSyncAccessHandle())
			.then(
				handle => {
					const fileSize = (append ? handle.getSize() : handle.truncate(0)) ?? 0;
					handle.write(data, {at: fileSize});
					handle.flush();
					handle.close();
					return Promise.resolve(data.byteLength);
				},
				error => Promise.reject(null)
			);
		}
		return Promise.reject(null);
	}
	static install(name, application){
		if(application.prototype instanceof ApplicationBase){
			this.commands[name] = application;
		}else if(application.prototype instanceof EnvironmentBase){
			this.envs[name.toUpperCase()] = application;
		}
	}
	static commands = {};
	static envs = {};
	static handlers = [];
}
addEventListener("message", function(e){
	const {command, environments, currentDirectory} = e.data;
	const launcher = new Launcher(command, environments, currentDirectory);
	launcher.launch(e.ports).then(exitValue => {
		postMessage({
			exitValue: exitValue ?? -1,
			environments: launcher.environments,
			currentDirectory: launcher.cd.pathname
		});
		close();
	});
});
importScripts("plugins.js");