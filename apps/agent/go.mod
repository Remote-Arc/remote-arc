module github.com/yaohuangguan/remote-arc/apps/agent

go 1.25.0

toolchain go1.25.5

require (
	github.com/gorilla/websocket v1.5.3
	github.com/modelcontextprotocol/go-sdk v1.8.0
	github.com/pion/webrtc/v4 v4.2.0
	github.com/yaohuangguan/remote-arc/packages/execution-core v0.0.0
	golang.org/x/sys v0.41.0
)

require (
	github.com/cpuguy83/go-md2man/v2 v2.0.2 // indirect
	github.com/google/jsonschema-go v0.4.3 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/nfnt/resize v0.0.0-20180221191011-83c6a9932646 // indirect
	github.com/pion/datachannel v1.5.10 // indirect
	github.com/pion/dtls/v3 v3.0.9 // indirect
	github.com/pion/ice/v4 v4.1.0 // indirect
	github.com/pion/interceptor v0.1.42 // indirect
	github.com/pion/logging v0.2.4 // indirect
	github.com/pion/mdns/v2 v2.1.0 // indirect
	github.com/pion/randutil v0.1.0 // indirect
	github.com/pion/rtcp v1.2.16 // indirect
	github.com/pion/rtp v1.8.27 // indirect
	github.com/pion/sctp v1.9.0 // indirect
	github.com/pion/sdp/v3 v3.0.17 // indirect
	github.com/pion/srtp/v3 v3.0.9 // indirect
	github.com/pion/stun/v3 v3.0.2 // indirect
	github.com/pion/transport/v3 v3.1.1 // indirect
	github.com/pion/turn/v4 v4.1.3 // indirect
	github.com/russross/blackfriday/v2 v2.1.0 // indirect
	github.com/segmentio/asm v1.1.3 // indirect
	github.com/segmentio/encoding v0.5.4 // indirect
	github.com/tc-hib/go-winres v0.3.3 // indirect
	github.com/tc-hib/winres v0.2.1 // indirect
	github.com/urfave/cli/v2 v2.25.7 // indirect
	github.com/wlynxg/anet v0.0.5 // indirect
	github.com/xrash/smetrics v0.0.0-20201216005158-039620a65673 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
	golang.org/x/crypto v0.33.0 // indirect
	golang.org/x/image v0.12.0 // indirect
	golang.org/x/net v0.35.0 // indirect
	golang.org/x/oauth2 v0.35.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/time v0.15.0 // indirect
)

replace github.com/yaohuangguan/remote-arc/packages/execution-core => ../../packages/execution-core

tool github.com/tc-hib/go-winres
