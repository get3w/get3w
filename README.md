# A hackable static site generator for the 21st Century

**Documentation:** [![GoDoc](https://godoc.org/github.com/get3w/get3w/get3w?status.svg)](https://godoc.org/github.com/get3w/get3w/get3w)  
**Build Status:** [![Build Status](https://travis-ci.org/get3w/get3w.svg?branch=master)](https://travis-ci.org/get3w/get3w)  
**Test Coverage:** [![Test Coverage](https://coveralls.io/repos/get3w/get3w/badge.svg?branch=master)](https://coveralls.io/r/get3w/get3w?branch=master) ([gocov report](https://drone.io/github.com/get3s/get3w/files/coverage.html))

get3w requires Go version 1.1 or greater.

## Usage ##

```go
import "github.com/get3w/get3w/github"
```

Construct a new Get3W client, then use the various services on the client to
access different parts of the Get3W API.  For example:

```go
client := get3w.NewClient(nil)
apps, _, err := get3w.Apps.List()
```

Some API methods have optional parameters that can be passed.  For example,
to list public repositories for the "github" organization:

```go
client := get3w.NewClient(nil)
opt := &get3w.RepositoryListByOrgOptions{Type: "public"}
repos, _, err := client.Repositories.ListByOrg("github", opt)
```

### Authentication ###

The get3w library does not directly handle authentication.  Instead, when
creating a new client, pass an `http.Client` that can handle authentication for
you.  The easiest and recommended way to do this is using the [oauth2][]
library, but you can always use any other library that provides an
`http.Client`.  If you have an OAuth2 access token (for example, a [personal
API token][]), you can use it with oauth2 using:

```go
func main() {
  ts := oauth2.StaticTokenSource(
    &oauth2.Token{AccessToken: "... your access token ..."},
  )
  tc := oauth2.NewClient(oauth2.NoContext, ts)

  client := get3w.NewClient(tc)

  // list all repositories for the authenticated user
  repos, _, err := client.Repositories.List("", nil)
}
```

See the [oauth2 docs][] for complete instructions on using that library.

### Pagination ###

All requests for resource collections (repos, pull requests, issues, etc)
support pagination. Pagination options are described in the
`get3w.ListOptions` struct and passed to the list methods directly or as an
embedded type of a more specific list options struct (for example
`get3w.PullRequestListOptions`).  Pages information is available via
`get3w.Response` struct.

```go
client := get3w.NewClient(nil)
opt := &get3w.RepositoryListByOrgOptions{
  Type: "public",
  ListOptions: get3w.ListOptions{PerPage: 10, Page: 2},
}
repos, resp, err := client.Repositories.ListByOrg("get3w", opt)
fmt.Println(resp.NextPage) // outputs 3
```

For complete usage of get3w, see the full [package docs][].

[package docs]: https://godoc.org/github.com/get3w/get3w/get3w


## License ##

This library is distributed under the MIT license found in the [LICENSE](./LICENSE)
file.

gox -osarch=darwin/amd64
gox -osarch=windows/amd64
