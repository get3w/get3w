package client

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/get3w/get3w/cli"
	"github.com/get3w/get3w/config"
	"github.com/get3w/get3w/pkg/term"
)

// Get3WCli represents the docker command line client.
// Instances of the client can be returned from NewGet3WCli.
type Get3WCli struct {
	// initializing closure
	init func() error

	// configFile has the client configuration file
	configFile *config.ConfigFile
	// in holds the input stream and closer (io.ReadCloser) for the client.
	in io.ReadCloser
	// out holds the output stream (io.Writer) for the client.
	out io.Writer
	// err holds the error stream (io.Writer) for the client.
	err io.Writer
	// keyFile holds the key file as a string.
	keyFile string
	// inFd holds the file descriptor of the client's STDIN (if valid).
	inFd uintptr
	// outFd holds file descriptor of the client's STDOUT (if valid).
	outFd uintptr
	// isTerminalIn indicates whether the client's STDIN is a TTY
	isTerminalIn bool
	// isTerminalOut indicates whether the client's STDOUT is a TTY
	isTerminalOut bool
	// transport holds the client transport instance.
	transport *http.Transport
}

// Initialize calls the init function that will setup the configuration for the client
// such as the TLS, tcp and other parameters used to run the client.
func (cli *Get3WCli) Initialize() error {
	if cli.init == nil {
		return nil
	}
	return cli.init()
}

// CheckTtyInput checks if we are trying to attach to a container tty
// from a non-tty client input stream, and if so, returns an error.
func (cli *Get3WCli) CheckTtyInput(attachStdin, ttyMode bool) error {
	// In order to attach to a container tty, input stream for the client must
	// be a tty itself: redirecting or piping the client standard input is
	// incompatible with `docker run -t`, `docker exec -t` or `docker attach`.
	if ttyMode && attachStdin && !cli.isTerminalIn {
		return errors.New("cannot enable tty mode on non tty input")
	}
	return nil
}

// NewGet3WCli returns a Get3WCli instance with IO output and error streams set by in, out and err.
// The key file, protocol (i.e. unix) and address are passed in as strings, along with the tls.Config. If the tls.Config
// is set the client scheme will be set to https.
// The client will be given a 32-second timeout (see https://github.com/docker/docker/pull/8035).
func NewGet3WCli(in io.ReadCloser, out, err io.Writer, clientFlags *cli.ClientFlags) *Get3WCli {
	cli := &Get3WCli{
		in:      in,
		out:     out,
		err:     err,
		keyFile: clientFlags.Common.TrustKey,
	}

	cli.init = func() error {

		clientFlags.PostParse()

		if cli.in != nil {
			cli.inFd, cli.isTerminalIn = term.GetFdInfo(cli.in)
		}
		if cli.out != nil {
			cli.outFd, cli.isTerminalOut = term.GetFdInfo(cli.out)
		}

		configFile, err := config.Load(config.ConfigDir())
		if err != nil {
			fmt.Fprintf(cli.err, "WARNING: Error loading config file:%v\n", err)
		}
		cli.configFile = configFile

		return nil
	}

	return cli
}
