// +build !windows

package chrootarchive

import (
	"fmt"
	"io"
	"io/ioutil"
	"os"

	"github.com/get3w/get3w/pkg/reexec"
)

func init() {
	reexec.Register("docker-applyLayer", applyLayer)
	reexec.Register("docker-untar", untar)
}

func fatal(err error) {
	fmt.Fprint(os.Stderr, err)
	os.Exit(1)
}

// flush consumes all the bytes from the reader discarding
// any errors
func flush(r io.Reader) {
	io.Copy(ioutil.Discard, r)
}
