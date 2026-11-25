class Remotelink < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.8.1"
  conflicts_with "remotelink-go", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.8.1/remotelink-v0.8.1-darwin-arm64", using: :nounzip
      sha256 "9b415f2c87af593990c92b7c812fb165667b012fa9fac3071277798af15ae2c4"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.8.1/remotelink-v0.8.1-darwin-amd64", using: :nounzip
      sha256 "8413d9e391633bf87d9ce11374557a5ce1afcd497ac282b02d8794c6884706b0"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.8.1/remotelink-v0.8.1-linux-arm64", using: :nounzip
      sha256 "9e51d4c0f54bdf80d08d78bf304961dc24d21b22b8a9af1a96e3ae614edb6324"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.8.1/remotelink-v0.8.1-linux-amd64", using: :nounzip
      sha256 "e8d57fc0d9f902648ec9714feb61b1b1e37a83e2419794d6643f04f7afa7a62b"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.8.1", shell_output("#{bin}/remotelink --version").strip
  end
end
