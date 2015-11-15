package client

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	gosignal "os/signal"
	"runtime"
	"strconv"
	"time"

	"github.com/Sirupsen/logrus"
	"github.com/get3w/get3w/pkg/signal"
	"github.com/get3w/get3w/pkg/term"
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
	return &http.Client{}
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

type streamOpts struct {
	rawTerminal bool
	in          io.Reader
	out         io.Writer
	err         io.Writer
	headers     map[string][]string
}

func (cli *DockerCli) resizeTty(id string, isExec bool) {
	height, width := cli.getTtySize()
	if height == 0 && width == 0 {
		return
	}
	v := url.Values{}
	v.Set("h", strconv.Itoa(height))
	v.Set("w", strconv.Itoa(width))
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
