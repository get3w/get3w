package client

import (
	"log"
	"os"
	"strings"
	"time"

	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
	"github.com/go-fsnotify/fsnotify"
)

// CmdWatch builds a new image from the source code at a given path.
//
// If '-' is provided instead of a path or URL, Docker will build an image from either a Dockerfile or tar archive read from STDIN.
//
// Usage: get3w run [OPTIONS] PATH | URL | -
func (cli *Get3WCli) CmdWatch(args ...string) error {
	cmd := Cli.Subcmd("watch", []string{"", "DIR"}, Cli.Get3WCommands["watch"].Description, true)
	cmd.Require(flag.Max, 1)
	cmd.ParseFlags(args, true)

	dir := cmd.Arg(0)

	return cli.watch(dir)
}

func (cli *Get3WCli) watch(dir string) error {
	parser, err := storage.NewLocalParser(dir)
	if err != nil {
		return err
	}

	err = parser.Build(true)
	if err != nil {
		return err
	}

	sourcePath := parser.Storage.GetSourcePrefix("")
	destinationPath := strings.TrimRight(strings.ToLower(parser.Storage.GetDestinationPrefix("")), string(os.PathSeparator))
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatal(err)
	}
	defer watcher.Close()

	done := make(chan bool)
	go func() {
		lastTime := time.Now()
		for {
			select {
			case event := <-watcher.Events:
				if !strings.HasPrefix(strings.ToLower(event.Name), destinationPath) {
					now := time.Now()
					d := now.Sub(lastTime)
					if d.Seconds() > 1 {
						log.Println("build done.")

						parser, err := storage.NewLocalParser(dir)
						if err != nil {
							log.Println("error:", err)
						}

						err = parser.Build(false)
						if err != nil {
							log.Println("error:", err)
						}

						lastTime = time.Now()
					}
				}

				// if event.Op&fsnotify.Write == fsnotify.Write {
				// 	log.Println("modified file:", event.Name)
				// }
			case err := <-watcher.Errors:
				log.Println("error:", err)
			}
		}
	}()

	err = watcher.Add(sourcePath)
	if err != nil {
		log.Fatal(err)
	}

	<-done

	return nil
}
