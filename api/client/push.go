package client

import (
	"fmt"
	"net/http"

	"github.com/get3w/get3w-sdk-go/get3w"
	Cli "github.com/get3w/get3w/cli"
	flag "github.com/get3w/get3w/pkg/mflag"
	"github.com/get3w/get3w/storage"
)

// CmdPush pushs an app or a repository to the registry.
//
// Usage: get3w pull [OPTIONS] IMAGENAME[:TAG|@DIGEST]
func (cli *Get3WCli) CmdPush(args ...string) error {
	cmd := Cli.Subcmd("push", []string{"NAME[:TAG|@DIGEST]"}, Cli.Get3WCommands["push"].Description, true)
	cmd.Require(flag.Exact, 0)
	cmd.ParseFlags(args, true)
	appname := cmd.Arg(0)

	owner := cli.configFile.AuthConfig.Username

	// if cli.configFile.AuthConfig.AccessToken == "" {
	// 	fmt.Fprintf(cli.out, "\nPlease login prior to %s:\n", "push")
	// 	if err := cli.CmdLogin(); err != nil {
	// 		return err
	// 	}
	// }
	client := get3w.NewClient(cli.configFile.AuthConfig.AccessToken)
	site, err := storage.NewLocalSite(appname)
	if err != nil {
		return err
	}

	inputAttempt := &get3w.AppPushInput{}
	resp, err := client.Apps.Push(owner, site.Name, inputAttempt)
	if err != nil && resp.StatusCode == http.StatusUnauthorized {
		fmt.Fprintf(cli.out, "\nPlease login prior to %s:\n", "push")
		if err = cli.CmdLogin(); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}

	output, _, err := client.Apps.FilesChecksum(owner, site.Name)
	if err != nil {
		return err
	}
	files := output.Files

	localFiles, err := site.GetAllFiles()
	if err != nil {
		return err
	}

	input := &get3w.AppPushInput{
		Removed: []string{},
		Added:   []string{},
		Updated: []string{},
	}
	for _, localFile := range localFiles {
		checksum := files[localFile.Path]
		if checksum == "" {
			input.Added = append(input.Added, localFile.Path)
		} else {
			localChecksum, _ := site.Checksum(localFile.Path)
			if checksum != localChecksum {
				input.Updated = append(input.Updated, localFile.Path)
			}
		}
	}
	for path := range files {
		if !site.IsExist(path) {
			input.Removed = append(input.Removed, path)
		}
	}

	_, err = client.Apps.Push(owner, site.Name, input)
	return err
}
