package client

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/get3w/get3w"
	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
)

// CmdGet get an app repository from the remote address.
//
// Usage: get3w get [OPTIONS] REMOTEURL DIR
func (cli *Get3WCli) CmdGet(args ...string) error {
	cmd := Cli.Subcmd("get", []string{"URL", "URL DIR"}, Cli.Get3WCommands["get"].Description, true)
	cmd.Require(flag.Min, 1)
	cmd.ParseFlags(args, true)

	url := cmd.Arg(0)
	dir := cmd.Arg(1)

	return cli.get(url, dir)
}

// splitURL breaks a url into an index name and remote name
func splitURL(url string) (string, string, string, error) {
	nameParts := strings.SplitN(strings.Trim(url, "/"), "/", 3)
	if len(nameParts) < 2 {
		return "", "", "", errors.New("Fatal: Invalid repository name (ex: \"get3w.com/myname/myrepo\")")
	}
	if len(nameParts) == 2 {
		return get3w.DefaultRepositoryHost(), nameParts[0], nameParts[1], nil
	}

	return nameParts[0], nameParts[1], nameParts[2], nil
}

func (cli *Get3WCli) get(url, dir string) error {
	authConfig := &cli.config.AuthConfig
	var host, owner, name string
	var err error

	if url != "" {
		host, owner, name, err = splitURL(url)
		if err != nil {
			return err
		}

		if dir == "" {
			dir = name
		}
	}

	parser, err := storage.NewLocalParser(authConfig.Username, dir)
	if err != nil {
		return err
	}

	if url == "" {
		host = get3w.DefaultRepositoryHost()
		owner = authConfig.Username
		name = parser.Name
	}

	client := get3w.NewClient(cli.config.AuthConfig.AccessToken)

	if host != get3w.DefaultRepositoryHost() {
		return fmt.Errorf("ERROR: Only %s supported\n", get3w.DefaultRepositoryHost())
	}

	fmt.Printf("Getting repository '%s/%s/%s'...\n", host, owner, name)

	fmt.Print("Counting objects: ")
	output, _, err := client.Apps.FilesChecksum(owner, name)
	if err != nil {
		return err
	}
	fmt.Printf("%d, done.\n", len(output.Files))

	for path, remoteChecksum := range output.Files {
		download := false
		if !parser.Storage.IsExist(parser.Storage.GetSourceKey(path)) {
			download = true
		} else {
			checksum, _ := parser.Storage.Checksum(parser.Storage.GetSourceKey(path))
			if checksum != remoteChecksum {
				download = true
			}
		}

		if download {
			fmt.Printf("Receiving object: %s", path)
			fileOutput, _, err := client.Apps.GetFile(owner, name, path)
			if err != nil {
				return err
			}
			data, err := base64.StdEncoding.DecodeString(fileOutput.Content)
			if err != nil {
				return err
			}
			parser.Storage.Write(parser.Storage.GetSourceKey(path), data)
			fmt.Println(", done.")
		}
	}

	// parser.Config.Repository = repo
	// err = parser.WriteConfig()
	// if err != nil {
	// 	return err
	// }

	return cli.build(dir)
}
