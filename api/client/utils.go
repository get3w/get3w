package client

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	gosignal "os/signal"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/Sirupsen/logrus"
	"github.com/get3w/get3w/api"
	"github.com/get3w/get3w/cliconfig"
	"github.com/get3w/get3w/dockerversion"
	"github.com/get3w/get3w/pkg/jsonmessage"
	"github.com/get3w/get3w/pkg/signal"
	"github.com/get3w/get3w/pkg/stdcopy"
	"github.com/get3w/get3w/pkg/term"
	"github.com/get3w/get3w/utils"
)

var (
	errConnectionFailed = errors.New("Cannot connect to the Docker daemon. Is the docker daemon running on this host?")
)

type serverResponse struct {
	body       io.ReadCloser
	header     http.Header
	statusCode int
}

// HTTPClient creates a new HTTP client with the cli's client transport instance.
func (cli *DockerCli) HTTPClient() *http.Client {
	return &http.Client{Transport: cli.transport}
}

func (cli *DockerCli) encodeData(data interface{}) (*bytes.Buffer, error) {
	params := bytes.NewBuffer(nil)
	if data != nil {
		if err := json.NewEncoder(params).Encode(data); err != nil {
			return nil, err
		}
	}
	return params, nil
}

func (cli *DockerCli) clientRequest(method, path string, in io.Reader, headers map[string][]string) (*serverResponse, error) {

	serverResp := &serverResponse{
		body:       nil,
		statusCode: -1,
	}

	expectedPayload := (method == "POST" || method == "PUT")
	if expectedPayload && in == nil {
		in = bytes.NewReader([]byte{})
	}
	req, err := http.NewRequest(method, fmt.Sprintf("%s/v%s%s", cli.basePath, api.Version, path), in)
	if err != nil {
		return serverResp, err
	}

	// Add CLI Config's HTTP Headers BEFORE we set the Docker headers
	// then the user can't change OUR headers
	for k, v := range cli.configFile.HTTPHeaders {
		req.Header.Set(k, v)
	}

	req.Header.Set("User-Agent", "Docker-Client/"+dockerversion.Version+" ("+runtime.GOOS+")")
	req.URL.Host = cli.addr
	req.URL.Scheme = cli.scheme

	if headers != nil {
		for k, v := range headers {
			req.Header[k] = v
		}
	}

	if expectedPayload && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "text/plain")
	}

	resp, err := cli.HTTPClient().Do(req)
	if resp != nil {
		serverResp.statusCode = resp.StatusCode
	}

	if err != nil {
		if utils.IsTimeout(err) || strings.Contains(err.Error(), "connection refused") || strings.Contains(err.Error(), "dial unix") {
			return serverResp, errConnectionFailed
		}

		if cli.tlsConfig == nil && strings.Contains(err.Error(), "malformed HTTP response") {
			return serverResp, fmt.Errorf("%v.\n* Are you trying to connect to a TLS-enabled daemon without TLS?", err)
		}
		if cli.tlsConfig != nil && strings.Contains(err.Error(), "remote error: bad certificate") {
			return serverResp, fmt.Errorf("The server probably has client authentication (--tlsverify) enabled. Please check your TLS client certification settings: %v", err)
		}

		return serverResp, fmt.Errorf("An error occurred trying to connect: %v", err)
	}

	if serverResp.statusCode < 200 || serverResp.statusCode >= 400 {
		body, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			return serverResp, err
		}
		if len(body) == 0 {
			return serverResp, fmt.Errorf("Error: request returned %s for API route and version %s, check if the server supports the requested API version", http.StatusText(serverResp.statusCode), req.URL)
		}
		return serverResp, fmt.Errorf("Error response from daemon: %s", bytes.TrimSpace(body))
	}

	serverResp.body = resp.Body
	serverResp.header = resp.Header
	return serverResp, nil
}

// cmdAttempt builds the corresponding registry Auth Header from the given
// authConfig. It returns the servers body, status, error response
func (cli *DockerCli) cmdAttempt(authConfig cliconfig.AuthConfig, method, path string, in io.Reader, out io.Writer) (io.ReadCloser, int, error) {
	buf, err := json.Marshal(authConfig)
	if err != nil {
		return nil, -1, err
	}
	registryAuthHeader := []string{
		base64.URLEncoding.EncodeToString(buf),
	}

	// begin the request
	serverResp, err := cli.clientRequest(method, path, in, map[string][]string{
		"X-Registry-Auth": registryAuthHeader,
	})
	if err == nil && out != nil {
		// If we are streaming output, complete the stream since
		// errors may not appear until later.
		err = cli.streamBody(serverResp.body, serverResp.header.Get("Content-Type"), true, out, nil)
	}
	if err != nil {
		// Since errors in a stream appear after status 200 has been written,
		// we may need to change the status code.
		if strings.Contains(err.Error(), "Authentication is required") ||
			strings.Contains(err.Error(), "Status 401") ||
			strings.Contains(err.Error(), "401 Unauthorized") ||
			strings.Contains(err.Error(), "status code 401") {
			serverResp.statusCode = http.StatusUnauthorized
		}
	}
	return serverResp.body, serverResp.statusCode, err
}

func (cli *DockerCli) callWrapper(method, path string, data interface{}, headers map[string][]string) (io.ReadCloser, http.Header, int, error) {
	sr, err := cli.call(method, path, data, headers)
	return sr.body, sr.header, sr.statusCode, err
}

func (cli *DockerCli) call(method, path string, data interface{}, headers map[string][]string) (*serverResponse, error) {
	params, err := cli.encodeData(data)
	if err != nil {
		sr := &serverResponse{
			body:       nil,
			header:     nil,
			statusCode: -1,
		}
		return sr, nil
	}

	if data != nil {
		if headers == nil {
			headers = make(map[string][]string)
		}
		headers["Content-Type"] = []string{"application/json"}
	}

	serverResp, err := cli.clientRequest(method, path, params, headers)
	return serverResp, err
}

type streamOpts struct {
	rawTerminal bool
	in          io.Reader
	out         io.Writer
	err         io.Writer
	headers     map[string][]string
}

func (cli *DockerCli) stream(method, path string, opts *streamOpts) (*serverResponse, error) {
	serverResp, err := cli.clientRequest(method, path, opts.in, opts.headers)
	if err != nil {
		return serverResp, err
	}
	return serverResp, cli.streamBody(serverResp.body, serverResp.header.Get("Content-Type"), opts.rawTerminal, opts.out, opts.err)
}

func (cli *DockerCli) streamBody(body io.ReadCloser, contentType string, rawTerminal bool, stdout, stderr io.Writer) error {
	defer body.Close()

	if api.MatchesContentType(contentType, "application/json") {
		return jsonmessage.DisplayJSONMessagesStream(body, stdout, cli.outFd, cli.isTerminalOut)
	}
	if stdout != nil || stderr != nil {
		// When TTY is ON, use regular copy
		var err error
		if rawTerminal {
			_, err = io.Copy(stdout, body)
		} else {
			_, err = stdcopy.StdCopy(stdout, stderr, body)
		}
		logrus.Debugf("[stream] End of stdout")
		return err
	}
	return nil
}

func (cli *DockerCli) resizeTty(id string, isExec bool) {
	height, width := cli.getTtySize()
	if height == 0 && width == 0 {
		return
	}
	v := url.Values{}
	v.Set("h", strconv.Itoa(height))
	v.Set("w", strconv.Itoa(width))

	path := ""
	if !isExec {
		path = "/containers/" + id + "/resize?"
	} else {
		path = "/exec/" + id + "/resize?"
	}

	if _, _, err := readBody(cli.call("POST", path+v.Encode(), nil, nil)); err != nil {
		logrus.Debugf("Error resize: %s", err)
	}
}

// getExecExitCode perform an inspect on the exec command. It returns
// the running state and the exit code.
func getExecExitCode(cli *DockerCli, execID string) (bool, int, error) {
	serverResp, err := cli.call("GET", "/exec/"+execID+"/json", nil, nil)
	if err != nil {
		// If we can't connect, then the daemon probably died.
		if err != errConnectionFailed {
			return false, -1, err
		}
		return false, -1, nil
	}

	defer serverResp.body.Close()

	//TODO: Should we reconsider having a type in api/types?
	//this is a response to exex/id/json not container
	var c struct {
		Running  bool
		ExitCode int
	}

	if err := json.NewDecoder(serverResp.body).Decode(&c); err != nil {
		return false, -1, err
	}

	return c.Running, c.ExitCode, nil
}

func (cli *DockerCli) monitorTtySize(id string, isExec bool) error {
	cli.resizeTty(id, isExec)

	if runtime.GOOS == "windows" {
		go func() {
			prevH, prevW := cli.getTtySize()
			for {
				time.Sleep(time.Millisecond * 250)
				h, w := cli.getTtySize()

				if prevW != w || prevH != h {
					cli.resizeTty(id, isExec)
				}
				prevH = h
				prevW = w
			}
		}()
	} else {
		sigchan := make(chan os.Signal, 1)
		gosignal.Notify(sigchan, signal.SIGWINCH)
		go func() {
			for range sigchan {
				cli.resizeTty(id, isExec)
			}
		}()
	}
	return nil
}

func (cli *DockerCli) getTtySize() (int, int) {
	if !cli.isTerminalOut {
		return 0, 0
	}
	ws, err := term.GetWinsize(cli.outFd)
	if err != nil {
		logrus.Debugf("Error getting size: %s", err)
		if ws == nil {
			return 0, 0
		}
	}
	return int(ws.Height), int(ws.Width)
}

func readBody(serverResp *serverResponse, err error) ([]byte, int, error) {
	if serverResp.body != nil {
		defer serverResp.body.Close()
	}
	if err != nil {
		return nil, serverResp.statusCode, err
	}
	body, err := ioutil.ReadAll(serverResp.body)
	if err != nil {
		return nil, -1, err
	}
	return body, serverResp.statusCode, nil
}
