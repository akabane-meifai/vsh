Launcher.install("cls", class extends ApplicationBase{
	main(args){
		this.stdout.write(new TextEncoder().encode("\u001b[2J"));
		return 0;
	}
});
Launcher.install("echo", class extends ApplicationBase{
	main(args){
		const {data} = this.parseArgs(args, {data: "string[] %1*"});
		this.stdout.write(new TextEncoder().encode(data.join(" ") + "\n"));
		return 0;
	}
});
Launcher.install("set", class extends ApplicationBase{
	main(args){
		const token = args.at(1);
		let pos = null;
		if((token == null) || ((pos = token.indexOf("=")) <= 0)){
			return 1;
		}
		const key = token.slice(0, pos).toUpperCase();
		const value = token.slice(pos + 1);
		if(value == ""){
			delete this.environments[key];
		}else{
			this.environments[key] = value;
		}
		return 0;
	}
});
Launcher.install("type", class extends ApplicationBase{
	main(args){
		const {stdin, files} = this.parseArgs(args, {
			stdin: "bool stdin,-i",
			files: "string[] file,-f,%1*"
		});
		if(stdin){
			return this.stdin.getStream().then(stream => Array.fromAsync(stream)).then(data => {
				return new Blob(data).arrayBuffer();
			}).then(buffer => {
				this.stdout.write(new Uint8Array(buffer));
				return Promise.resolve(0);
			});
		}
		return Array.fromAsync(files.map(item => this.file.getResponse(item).then(res => res.arrayBuffer())))
		.then(buffers => {
			const n = buffers.length;
			for(let i = 0; i < n; i++){
				const rt = new TextEncoder().encode("\n");
				this.stdout.write(new Uint8Array(buffers[i]));
				this.stdout.write(rt);
			}
			return Promise.resolve(0);
		}, error => {
			return Promise.resolve(1);
		});
	}
});
Launcher.install("cd", class extends ApplicationBase{
	main(args){
		this.cd(args.at(1));
		return 0;
	}
});

Launcher.install("CD", class extends EnvironmentBase{
	main(){
		return this.launcher.cd.pathname;
	}
});
Launcher.install("USER_AGENT", class extends EnvironmentBase{
	main(){
		return navigator.userAgent;
	}
});