# 在 Linux 或阿里云 ECS 部署

本文只使用通用占位符，不包含任何实际服务器地址、域名、账号、密钥或运行数据。

## 从 Windows 连接阿里云

### 1. 准备自己的连接信息

从 ECS 控制台获取实例的公网 IP 或 EIP，确认实际 SSH 用户、端口和登录方式。以下大写占位符必须替换为自己的信息；私钥只保存在自己电脑上。

```powershell
$serverIp = "YOUR_SERVER_IP"
$serverUser = "YOUR_USER"
$keyPath = Join-Path $env:USERPROFILE ".ssh\YOUR_KEY.pem"
```

这些变量仅用于当前终端，不应把替换后的私人版本提交到 GitHub。

### 2. 查询当前网络出口并配置安全组

电脑连接路由器、手机热点或运营商网络时，本地 `ipconfig` 中的地址通常不是服务器看到的公网来源。可在当前网络下查询公网 IPv4：

```powershell
curl.exe --noproxy "*" -4 https://api.ipify.org
```

在实例关联的安全组添加入方向规则：允许 TCP、端口为实际 SSH 端口（默认 22）、访问来源为自己的可信公网 IP。单个 IPv4 可写成 `YOUR_PUBLIC_IP/32`。更换热点、重连移动网络或出口地址变化后，应重新检查来源。

代理、VPN 或运营商多出口可能导致网页请求与 SSH 的来源不同；连接不通时，应结合实例侧诊断核对。阿里云的 [安全组使用说明](https://help.aliyun.com/zh/ecs/user-guide/start-using-security-groups) 建议远程管理端口限定可信来源。

### 3. 测试 SSH 端口

```powershell
Test-NetConnection -ComputerName $serverIp -Port 22
```

- `ComputerName`：要连接的实例地址。
- `Port 22`：测试 TCP 22；若自行更改 SSH 端口，填写实际端口。
- `TcpTestSucceeded=True`：TCP 连接成功，随后可检查账号和密钥。
- `TcpTestSucceeded=False`：继续排查安全组、实例防火墙、SSH 监听和网络出口。
- `PingSucceeded=True` 仅说明 ICMP 可达，不代表 SSH 端口已经放行；部分网络也会禁止 Ping。

### 4. 使用自己的账号登录

密钥方式：

```powershell
ssh -i $keyPath "$serverUser@$serverIp"
```

使用其他 SSH 端口时：

```powershell
ssh -i $keyPath -p YOUR_SSH_PORT "$serverUser@$serverIp"
```

密码方式（实例已启用时）：

```powershell
ssh "$serverUser@$serverIp"
```

`-i` 指定私钥，`-p` 指定 SSH 端口。密码在 SSH 终端中输入。首次连接时，按 [阿里云 OpenSSH 文档](https://help.aliyun.com/zh/ecs/user-guide/connect-to-an-instance-by-using-third-party-client-tools/) 核验实例的主机密钥指纹。

出现 `Permission denied (publickey)` 时，检查用户、私钥、实例绑定和文件权限；它与端口超时属于不同问题。需要更详细的诊断时，可在自己的终端增加 `-v`，分享日志前去除真实地址、账号和本机路径。

### 5. 通过 SSH 隧道访问站点

应用默认监听服务器的回环地址。下面以本地 18080 转发到服务器 3000 为通用示例：

```powershell
ssh -i $keyPath -N -L 127.0.0.1:18080:127.0.0.1:3000 "$serverUser@$serverIp"
```

- `-N`：只建立隧道，不打开远程交互终端。
- `-L`：把本地端口转发到服务器可访问的指定地址。
- 保持该窗口运行，在浏览器访问 `http://127.0.0.1:18080`。
- 本地端口占用时，改用其他空闲端口，并在浏览器使用相应地址。

隧道模式的 `APP_ORIGIN` 应与浏览器实际访问地址一致；公网模式采用自己的正式 HTTPS 域名。按 HTTP/HTTPS 模式配置 `COOKIE_SECURE`，实际环境文件始终由部署者私下保管。

### 6. 实例侧排错

可通过阿里云控制台的 Workbench/VNC 等方式进入实例，再查看监听和站点健康状态：

```bash
sudo ss -lntp 'sport = :22'
sudo ss -lntp 'sport = :3000'
curl --fail http://127.0.0.1:3000/api/health
```

Ubuntu/Debian 可检查 `ssh.service`、`ssh.socket`；其他系统按实际服务名称检查 `sshd.service`。应用服务使用自己安装时的名称：

```bash
systemctl status YOUR_APP_SERVICE --no-pager
journalctl -u YOUR_APP_SERVICE -n 50 --no-pager
```

如果 SSH 可登录而本地网页打不开，按“实例内应用健康状态 → 隧道是否仍在运行 → 本地端口是否正确 → 浏览器访问地址与 APP_ORIGIN”依次检查。个人实际命令、控制台截图和诊断输出留在私有记录中。

## 部署条件

- Node.js 24 或更新的兼容版本。
- Linux 主机、持久化数据目录，以及按需配置的域名和 HTTPS。
- 使用自己的 SSH 凭据、安全组规则、系统用户和服务名称。

## 源码与环境

将本仓库源码放到自己的应用目录，执行：

```bash
npm ci
npm run build
```

根据 `deploy/production.env.example` 创建服务器专用的环境文件。必须将环境文件和 `DATA_DIR` 放在源码及公开静态目录之外。示例中的模型地址、模型名和 API Key 为空，部署者自行配置。

至少检查：

- `APP_ORIGIN` 与实际访问域名一致。
- HTTPS 部署启用 `COOKIE_SECURE=true`。
- `DATA_DIR` 指向持久化目录；应用服务用户具有读写权限。
- `BACKUP_DIR` 与源码分离，只有需要访问备份的管理员可读取。

`deploy/xingyu.service` 与 Nginx 文件为通用模板。根据自己的 Node.js、源码和环境文件路径修改后再安装；不要原样覆盖已经使用的服务器配置。

## 首次初始化

启动应用后，从自己的数据目录读取 `setup-token.txt`，通过网页创建管理员。初始化码不是默认密码，完成创建后即失效。也可在正确的数据目录和环境下执行 `npm run setup`。

## 更新与回退

1. 先对数据库做一致性备份，并一并备份数据目录中的加密主密钥。
2. 在独立发布目录安装依赖、构建和测试新版本。
3. 保留服务器原有环境、域名、Nginx、systemd 和持久化数据。
4. 切换应用版本并检查 `/api/health`。
5. 检查管理员登录、私有备忘录、待办和图片的访问权限。
6. 验证失败时切回之前的应用版本；涉及数据库格式变化时按对应迁移方案处理。

SSH 登录、端口转发和云安全组均使用自己的服务器信息。不要将实际 IP、私钥、数据库、初始化码、API Key、日志或备份添加到公开仓库。
