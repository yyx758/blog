---
title: "spring ai 1.1.7 mcp的学习"
date: 2026-06-08
tags: ["Spring Ai", "MCP"]
---


## 1 什么是 MCP？
MCP (Model Context Protocol) 是 Anthropic 开发的开放协议，用于 AI 模型与外部工具/服务之间的通信。

我们前面学过了Function Calling,注意要和MCP区分,这也是面试常考点,这么理解呢?

- 就是Function Calling是内嵌在项目代码里的,耦合性很高,复用性很低,跨平台性差,维护困难,每次想要修改工具,就得修改整个应用
- 而MCP是基于协议的,任何遵循MCP协议的服务都能被LLM使用,是独立的服务,复用性很高,耦合度很低,

> 举例来说,要是是Function Calling形式的服务工具,你是用java代码写的,那么再其他python,go的项目里就完全使用不了,而且每个平台关于tools编写的要求也不一致,可能有Openai,anthropic等等不同规范

> 但是使用MCP这套统一的标准,不管你是什么语言,都能被成功的复用,相当于一个接口

了解这个之后我们来看MCP的架构

## 2 MCP架构

MCP一般分为两个部分:
- 一个是MCP的客户端,也就是要调用MCP服务的一端,MCP Client
-  一个是MCP的服务端,也就是提供MCP服务的一段,MCP Server,MCP server可以是自己编写的一个服务,也可以是别人已经封装好的服务,像Github MCP Server等


## 3 MCP客户端与服务端交互方式
上面也说了,MCP是单独的服务,不是耦合在项目里的,那么如何让MCP Client和MCP server直接通信就成了一个问题

> 在Sping ai 1.1.0之前

我们用的是两种方式:
- 一种是本地的调用:stdio
- 一种是SSE

> 在Spring ai 1.1.7

sse被Streamable HTTP替代

我们来看看两种方式的区别:

- **stdio本地调用不需要关注端口号,不需要关注http协议,也不需要手动拉起MCP Server,本地开发更简单**
- **而Streamable HTTP 需要关注端口号,http协议,通常需要先手动来起MCP Server,配置稍复杂,更适合远程服务、多个应用共享工具**

在后面demo中会再次体现

## 4 demo测试
我们这个是使用两种不同的通信方式集成的MCP

- 一个是使用本地调用的方式集成了经典的firecrawl服务
- 一个是使用Streamable HTTP的方式集成了自己编写的简易服务

下面我们开始进入demo

## 5 依赖配置

这里上一篇文章配置的spring-ai-starter-model-openai等就省略了,需要额外引入的就是支持MCP Client的依赖

Spring AI 提供了两种 MCP Client 依赖，适用于不同场景：

依赖1：spring-ai-starter-mcp-client（标准版）
```xml
     <!-- Spring AI MCP Client -->
        <dependency>
            <groupId>org.springframework.ai</groupId>
            <artifactId>spring-ai-starter-mcp-client</artifactId>
        </dependency>
```
**底层实现：JDK HttpClient（阻塞式）**

适用于简单应用比如以 STDIO 传输为主,开发和测试环境,不需要高并发的场景

依赖2：spring-ai-starter-mcp-client-webflux（WebFlux 版）
```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-mcp-client-webflux</artifactId>
</dependency>
```
**底层实现：WebFlux + Reactor Netty（非阻塞式）**

适用于生产部署（推荐）,高并发场景,需要响应式编程,长连接、流式处理的场景

我们这里测试就引入了第一种标准的mcp-client


## 6 配置文件

**MCP Client 与 MCP Server 的通信关系主要由配置文件驱动，配置里声明使用哪种传输方式、连接哪个 Server，或如何启动本地 Server。**

```yml
spring:
  application:
    name: springai-demo
  
  ai:
    # ============================================
    # AI 模型配置
    # ============================================
    openai:
      api-key: ${OPENAI_API_KEY:your-api-key}  # API 密钥
      base-url: https://api.deepseek.com       # API 地址（使用 DeepSeek）
      timeout: 30s                              # 请求超时时间
      chat:
        options:
          model: deepseek-v4-flash              # 模型名称
          temperature: 0.7                      # 温度参数（0-1，越高越随机）
          max-tokens: 2048                      # 最大 token 数
    
    # ============================================
    # MCP Client 配置（核心配置）
    # ============================================
    mcp:
      client:
        # ---------- 基础配置 ----------
        enabled: true                    # 是否启用 MCP 客户端（true/false）
        name: my-mcp-client             # 客户端名称（用于标识）
        version: 1.0.0                  # 客户端版本
        type: SYNC                      # 客户端类型：SYNC（同步）或 ASYNC（异步）
        request-timeout: 30s            # 请求超时时间
        
        # ---------- 工具回调配置 ----------
        toolcallback:
          enabled: true                 # 是否启用工具回调（让 AI 自动调用工具）
        
        # ============================================
        # 传输方式配置（可以同时配置多种）
        # ============================================
        
        # ---------- 方式1：Streamable HTTP 传输 ----------
        # 用于连接远程或本地的 HTTP MCP Server
        # 特点：需要 MCP Server 先启动，支持远程调用
        streamable-http:
          connections:                  # 连接配置（可以配置多个）
            my-server:                  # 连接名称（自定义，用于标识）
              url: http://localhost:3001  # MCP Server 的 URL 地址
              # endpoint: /mcp         # 可选：自定义端点路径（默认 /mcp）
        
        # ---------- 方式2：Stdio 传输 ----------
        # 用于启动本地 MCP Server 子进程
        # 特点：自动启动，无需手动启动 Server
        stdio:
          connections:                  # 连接配置（可以配置多个）
            firecrawl:                  # 连接名称（自定义）
              command: cmd              # 执行命令（Windows 必须用 cmd）
              args:                     # 命令参数列表
                - /c                    # cmd 参数：执行后面的命令
                - npx                   # Node.js 包执行器
                - -y                    # 自动确认安装
                - firecrawl-mcp        # 要执行的包名
              env:                      # 环境变量（传递给 MCP Server）
                FIRECRAWL_API_KEY: ${FIRECRAWL_API_KEY:your-key}

  # ============================================
  # 数据库配置（可选）
  # ============================================
  datasource:
    url: jdbc:mysql://localhost:3306/your_db
    username: root
    password: your_password
    driver-class-name: com.mysql.cj.jdbc.Driver

# ============================================
# 日志配置
# ============================================
logging:
  level:
    org.springframework.ai: DEBUG      # Spring AI 日志级别
    com.cquyyx: DEBUG                  # 项目包日志级别
```
**配置项详细说明**
可以看看官方的文档


![paste-1780918654697-yczuup.png](/api/posts?image=paste-1780918654697-yczuup.png&v=5e50d9bde5181eb6d84c66891487085eec6f97db)

![paste-1780918280043-3ciwo2.png](/api/posts?image=paste-1780918280043-3ciwo2.png&v=267f1756aacc27c588be4602dc89ab4902ec9797)
> 这里要讲解一下command和args,结合我们自己的配置
```xml
stdio:
          connections:                  # 连接配置（可以配置多个）
            firecrawl:                  # 连接名称（自定义）
              command: cmd              # 执行命令（Windows 必须用 cmd）
              args:                     # 命令参数列表
                - /c                    # cmd 参数：执行后面的命令
                - npx                   # Node.js 包执行器
                - -y                    # 自动确认安装
                - firecrawl-mcp        # 要执行的包名
              env:                      # 环境变量（传递给 MCP Server）
                FIRECRAWL_API_KEY: ${FIRECRAWL_API_KEY:your-key}
```

官方文档也给出了注意点:
![paste-1780918924235-2a3o71.png](/api/posts?image=paste-1780918924235-2a3o71.png&v=b502c71675dfe74de07f7494a254e5dde7036f23)
**意思是在 Windows 上，像 npx、npm、node 这些命令，有些并不是原生的 .exe 可执行文件，而是 .cmd 批处理脚本。Java 的 ProcessBuilder 不能像命令行一样直接执行这些批处理文件，所以需要通过 cmd.exe /c 包一层来执行。**

**我们的配置文件意思就是  cmd /c npx -y firecrawl-mcp**
![paste-1780918315822-kgnncx.png](/api/posts?image=paste-1780918315822-kgnncx.png&v=06103edde61c9d9fde8265f9ef20352f976e1218)

## 6 Spring Boot整合

> 编写FirecrawlController来测试 ,Firecrawl这个MCP Server能否正常启用
```java
package com.cquyyx.controller;


import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.mcp.SyncMcpToolCallbackProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/firecrawl")
@ConditionalOnProperty(name = "spring.ai.mcp.client.enabled", havingValue = "true", matchIfMissing = false)
public class FirecrawlController {

    private final ChatClient chatClient;

    /**
     * 注入 SyncMcpToolCallbackProvider
     * 只有在 MCP 启用时才会创建这个 Bean
     */
    public FirecrawlController(
            ChatModel chatModel,
            SyncMcpToolCallbackProvider toolCallbackProvider) {

        // 获取所有 MCP 工具
        var toolCallbacks = toolCallbackProvider.getToolCallbacks();

        System.out.println("========================================");
        System.out.println("✅ 已加载 MCP 工具:");
        System.out.println("✅ 已加载 MCP 工具数量: " + toolCallbacks.length);
        for (var tool : toolCallbacks) {
            System.out.println("  • " + tool.getToolDefinition().name());
        }
        System.out.println("========================================");

        // 创建 ChatClient 并注入工具
        this.chatClient = ChatClient.builder(chatModel)
                .defaultToolCallbacks(toolCallbacks)
                .build();
    }


    /**
     * 网页抓取
     * POST /api/firecrawl/scrape
     * Body: {"url": "https://example.com"}
     */
    @PostMapping("/scrape")
    public Map<String, String> scrape(@RequestBody Map<String, String> request) {
        String url = request.get("url");

        // AI 会自动决定使用哪个工具
        String content = chatClient.prompt()
                .system("""
                你是一个可以调用 MCP 工具的智能助手。
                当用户要求抓取网页 URL 时，必须调用可用的 firecrawl 抓取工具。
                不要说你无法调用工具。
                不要模拟工具调用。
                必须基于工具返回结果回答。
                回答时带上你具体使用的哪个工具
                """)
                .user("请使用 firecrawl 工具抓取这个网页的内容: " + url)
                .call()
                .content();

        return Map.of("url", url, "content", content);
    }

    /**
     * 网页搜索
     * POST /api/firecrawl/search
     * Body: {"query": "Spring AI tutorial"}
     */
    @PostMapping("/search")
    public Map<String, String> search(@RequestBody Map<String, String> request) {
        String query = request.get("query");

        String results = chatClient.prompt()
                .user("请使用 firecrawl 工具搜索: " + query)
                .call()
                .content();

        return Map.of("query", query, "results", results);
    }

    /**
     * 智能问答（AI 自动决定是否使用 Firecrawl）
     * POST /api/firecrawl/ask
     * Body: {"question": "帮我看看 https://spring.io 上有什么内容"}
     */
    @PostMapping("/ask")
    public Map<String, String> ask(@RequestBody Map<String, String> request) {
        String question = request.get("question");

        String answer = chatClient.prompt()
                .user(question)
                .call()
                .content();

        return Map.of("question", question, "answer", answer);
    }

}

```
**先讲讲怎么获取到外部服务的tools**

下面是AsyncMcpToolCallbackProvider.java的源码,我们来看看
```java
public ToolCallback[] getToolCallbacks() {
        if (this.invalidateCache) {   //invalidateCache是判断工具缓存是否存在,如果存在则为false,不存在则为true表示需要重新更新工具
            this.lock.lock(); //这里是为了线程安全,防止多个请求进来都调用该方法刷新工具

            try {
                if (this.invalidateCache) {
                    List<ToolCallback> toolCallbackList = new ArrayList();//这里是重点,实际上,方法返回的是 List<ToolCallback>,也就是tools的数组

                    for(McpAsyncClient mcpClient : this.mcpClients) {
                        ToolCallback[] toolCallbacks = (ToolCallback[])mcpClient.listTools().map((response) -> (ToolCallback[])response.tools().stream().filter((tool) -> this.toolFilter.test(connectionInfo(mcpClient), tool)).map((tool) -> AsyncMcpToolCallback.builder().mcpClient(mcpClient).tool(tool).prefixedToolName(this.toolNamePrefixGenerator.prefixedToolName(connectionInfo(mcpClient), tool)).toolContextToMcpMetaConverter(this.toolContextToMcpMetaConverter).build()).toArray((x$0) -> new ToolCallback[x$0])).block();
                        toolCallbackList.addAll(List.of(toolCallbacks));
                    }

                    this.cachedToolCallbacks = toolCallbackList;
                    this.validateToolCallbacks(this.cachedToolCallbacks);
                    this.invalidateCache = false;
                }
            } finally {
                this.lock.unlock();
            }
        }

        return (ToolCallback[])this.cachedToolCallbacks.toArray(new ToolCallback[0]);//最后返回的就是ToolCallback[]数组
    }
```


前两个是固定功能的测试,第三个是Agent的测试,我们用Apifox来分别测试结果:

**首先启动时初始化,会打印出我们获取的toollist[]**

![paste-1780920434457-nacl1j.png](/api/posts?image=paste-1780920434457-nacl1j.png&v=398a6f497b7eb82f43b024b764f9854191933f93)

![paste-1780920563807-0i8paz.png](/api/posts?image=paste-1780920563807-0i8paz.png&v=f77d0ea151d5f2f01a171e534e3d5a057a218bdb)

![paste-1780920673797-80er05.png](/api/posts?image=paste-1780920673797-80er05.png&v=30127e1d8c048b31e93801eab4444a81a60e89c3)

我们来看返回响应,状态码是200,根据日志来看也成功调用了工具

再看看/ask请求,这才是重点,我们传入的不是标准的url,而是prompt,llm会自己搜索可以使用的相关的工具来进行响应

![paste-1780920818609-viy8rr.png](/api/posts?image=paste-1780920818609-viy8rr.png&v=ff71e047ec3c65fdbb623a78eb6140beb69ccdd7)

可以看到也是成功的调用了MCP工具

> 编写McpToolController来测试自己编写的简单服务能不能通过Streamable HTTP成功调用

```java
package com.cquyyx.controller;


import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.mcp.SyncMcpToolCallbackProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/mcp")
@ConditionalOnProperty(name = "spring.ai.mcp.client.enabled", havingValue = "true")
public class McpToolController {

    private final ChatClient chatClient;
    private final SyncMcpToolCallbackProvider toolCallbackProvider;

    /**
     * 注入 SyncMcpToolCallbackProvider
     * 只有在 MCP 启用时才会创建这个 Bean
     */
    public McpToolController(
            ChatModel chatModel,
            SyncMcpToolCallbackProvider toolCallbackProvider) {

        this.toolCallbackProvider = toolCallbackProvider;

        // 获取所有 MCP 工具
        var toolCallbacks = toolCallbackProvider.getToolCallbacks();

        System.out.println("========================================");
        System.out.println("✅ 已加载 MCP 工具:");
        System.out.println("✅ 已加载 MCP 工具数量: " + toolCallbacks.length);
        for (var tool : toolCallbacks) {
            System.out.println("  • " + tool.getToolDefinition().name());
        }
        System.out.println("========================================");

        // 创建 ChatClient 并注入工具
        this.chatClient = ChatClient.builder(chatModel)
                .defaultToolCallbacks(toolCallbacks)
                .build();
    }

    /**
     * 列出所有可用的 MCP 工具
     * GET /api/mcp/tools
     */
    @GetMapping("/tools")
    public Map<String, Object> listTools() {
        var toolCallbacks = toolCallbackProvider.getToolCallbacks();
        return Map.of(
            "count", toolCallbacks.length,
            "tools", java.util.Arrays.stream(toolCallbacks)
                .map(tool -> Map.of("name", tool.getToolDefinition().name()))
                .toList()
        );
    }

    /**
     * 使用 AI 智能调用工具
     * POST /api/mcp/ask
     * Body: {"question": "现在几点了？"}
     */
    @PostMapping("/ask")
    public Map<String, String> ask(@RequestBody Map<String, String> request) {
        String question = request.get("question");

        String answer = chatClient.prompt()
                .user(question)
                .call()
                .content();

        return Map.of("question", question, "answer", answer);
    }

}

```

![paste-1780920969679-887uiz.png](/api/posts?image=paste-1780920969679-887uiz.png&v=186d6ce280e80943ab04e5973eebec43e49e37f9)
最终也是测试成功













